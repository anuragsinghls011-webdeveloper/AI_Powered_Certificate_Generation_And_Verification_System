const express = require('express');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { requirePermission } = require('../middleware/authMiddleware');
const { design } = require('../services/ai/aiDesignService');
const { designFromSketch } = require('../services/ai/aiSketchService');
const { DesignValidationError } = require('../services/ai/aiSchema');

const router = express.Router();
const limiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 20, standardHeaders: 'draft-7',
  legacyHeaders: false, keyGenerator: req => `${req.organization.id}:${req.user.id}`,
  message: { error: 'Too many design requests. Please try again shortly.' } });

// Sketch upload: accept a single image file up to 4MB
const sketchUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Only PNG, JPEG, and WebP sketch images are supported'));
    }
    cb(null, true);
  }
});

const handleSketchUpload = (req, res, next) => {
  sketchUpload.single('sketch')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'The sketch image exceeds the 4MB limit. Please upload a smaller image.' });
      }
      return res.status(422).json({ error: `Upload error: ${err.message}` });
    }
    if (err) {
      return res.status(422).json({ error: err.message });
    }
    next();
  });
};

// Slightly more generous rate limit for sketch (takes longer, fewer attempts)
const sketchLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 10, standardHeaders: 'draft-7',
  legacyHeaders: false, keyGenerator: req => `sketch:${req.organization.id}:${req.user.id}`,
  message: { error: 'Too many sketch requests. Please try again shortly.' } });

router.post('/design', requirePermission('templates.create'), limiter, async (req, res) => {
  try {
    const proposal = await design({ body: req.body, req });
    res.json({ success: true, message: proposal.summary, design: proposal });
  } catch (err) {
    if (err instanceof DesignValidationError) {
      return res.status(422).json({ error: 'I couldn\'t safely apply that design change. Please try a more specific instruction.' });
    }
    if (err.statusCode === 404) return res.status(404).json({ error: 'Template not found in this organization' });
    return res.status(503).json({ error: 'The AI designer is unavailable right now. Your design has not changed.' });
  }
});

router.post('/design-from-sketch', requirePermission('templates.create'), sketchLimiter,
  handleSketchUpload, async (req, res) => {
  try {
    const proposal = await designFromSketch({ body: req.body, file: req.file, req });
    res.json({ success: true, message: proposal.summary, design: proposal });
  } catch (err) {
    if (err instanceof DesignValidationError) {
      return res.status(422).json({ error: err.message || 'Could not create a valid design from this sketch. Try a different sketch or more specific prompt.' });
    }
    if (err.statusCode === 404) return res.status(404).json({ error: 'Template not found in this organization' });
    console.error('[Sketch route error]', err.message);
    return res.status(503).json({ error: 'The AI sketch designer is unavailable right now. Please try again later.' });
  }
});

module.exports = router;