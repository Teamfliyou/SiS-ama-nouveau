import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdmin } from '../middleware/auth';
import { asyncHandler, AppError } from '../lib/errors';
import { validate, documentInfoSchema, parseId } from '../lib/validate';

// Documents: important files (règlement intérieur, informations...) that every
// account can consult or download; only administrators upload, edit or remove.
// Files are stored in the database (Document.data).
const router = Router();

router.use(authenticate);

export const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10 Mo

// Accepted files, by extension. The type is derived from the extension (never
// from what the browser claims) and the first bytes must match it.
const PDF = [0x25, 0x50, 0x44, 0x46]; // %PDF
const ZIP = [0x50, 0x4b, 0x03, 0x04]; // docx, xlsx, odt
const OLE = [0xd0, 0xcf, 0x11, 0xe0]; // doc, xls
const FILE_TYPES: Record<string, { mime: string; magic: number[][] }> = {
  pdf: { mime: 'application/pdf', magic: [PDF] },
  png: { mime: 'image/png', magic: [[0x89, 0x50, 0x4e, 0x47]] },
  jpg: { mime: 'image/jpeg', magic: [[0xff, 0xd8, 0xff]] },
  jpeg: { mime: 'image/jpeg', magic: [[0xff, 0xd8, 0xff]] },
  webp: { mime: 'image/webp', magic: [[0x52, 0x49, 0x46, 0x46]] }, // RIFF
  doc: { mime: 'application/msword', magic: [OLE] },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', magic: [ZIP] },
  xls: { mime: 'application/vnd.ms-excel', magic: [OLE] },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', magic: [ZIP] },
  odt: { mime: 'application/vnd.oasis.opendocument.text', magic: [ZIP] },
};

export const ACCEPTED_EXTENSIONS = Object.keys(FILE_TYPES);

/** Type of an uploaded file from its name and content, or null when it is not accepted. */
export function detectFileType(fileName: string, data: Uint8Array): string | null {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  const type = FILE_TYPES[ext];
  if (!type || !fileName.includes('.')) return null;
  const matches = type.magic.some((sig) => sig.every((byte, i) => data[i] === byte));
  return matches ? type.mime : null;
}

const listSelect = {
  id: true,
  title: true,
  description: true,
  category: true,
  fileName: true,
  mimeType: true,
  size: true,
  createdAt: true,
  updatedAt: true,
  uploadedBy: { select: { email: true } },
} as const;

// GET /api/documents — every document (without its file), latest first.
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await prisma.document.findMany({ select: listSelect, orderBy: { createdAt: 'desc' } }));
  })
);

// GET /api/documents/:id/file — the file itself, as a download.
router.get(
  '/:id/file',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant de document invalide');
    const doc = await prisma.document.findUnique({ where: { id }, select: { fileName: true, mimeType: true, data: true } });
    if (!doc) throw new AppError(404, 'Document introuvable');
    res.attachment(doc.fileName);
    res.type(doc.mimeType);
    res.send(Buffer.from(doc.data));
  })
);

// The file is sent as the raw request body (its title, category and description in
// the query string). Oversized files get a clear message.
const rawFile = (req: Request, res: Response, next: NextFunction) =>
  express.raw({ type: () => true, limit: MAX_DOCUMENT_SIZE })(req, res, (err?: unknown) => {
    if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 413) {
      return next(new AppError(413, 'Fichier trop volumineux (10 Mo maximum)'));
    }
    next(err);
  });

// POST /api/documents?title=&category=&description=&fileName=
router.post(
  '/',
  requireAdmin,
  rawFile,
  asyncHandler(async (req, res) => {
    const query = req.query as Record<string, string | undefined>;
    const info = documentInfoSchema.safeParse({
      title: query.title,
      category: query.category || undefined,
      description: query.description,
    });
    if (!info.success) throw new AppError(400, info.error.issues[0]?.message ?? 'Données invalides');
    const fileName = (query.fileName ?? '').trim().slice(0, 200);
    if (!fileName) throw new AppError(400, 'Nom de fichier requis');
    const data = Buffer.isBuffer(req.body) ? (req.body as Buffer) : Buffer.alloc(0);
    if (data.length === 0) throw new AppError(400, 'Fichier vide');
    const mimeType = detectFileType(fileName, data);
    if (!mimeType) {
      throw new AppError(400, `Type de fichier non accepté (formats acceptés : ${ACCEPTED_EXTENSIONS.join(', ')})`);
    }
    const created = await prisma.document.create({
      data: { ...info.data, fileName, mimeType, size: data.length, data, uploadedById: req.user!.userId },
      select: listSelect,
    });
    res.status(201).json(created);
  })
);

// PUT /api/documents/:id — title, category and description (the file is kept).
router.put(
  '/:id',
  requireAdmin,
  validate(documentInfoSchema),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant de document invalide');
    if (!(await prisma.document.findUnique({ where: { id }, select: { id: true } }))) {
      throw new AppError(404, 'Document introuvable');
    }
    const { title, category, description } = req.body as { title: string; category: string; description: string | null };
    res.json(await prisma.document.update({ where: { id }, data: { title, category, description }, select: listSelect }));
  })
);

// DELETE /api/documents/:id
router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant de document invalide');
    const { count } = await prisma.document.deleteMany({ where: { id } });
    if (count === 0) throw new AppError(404, 'Document introuvable');
    res.json({ success: true });
  })
);

export default router;
