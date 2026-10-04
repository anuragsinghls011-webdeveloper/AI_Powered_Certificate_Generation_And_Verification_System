const express = require('express');
const rateLimit = require('express-rate-limit');
const { requirePermission } = require('../middleware/authMiddleware');
const { design } = require('../services/ai/aiDesignService');
const { DesignValidationError } = require('../services/ai/aiSchema');

const router = express.Router();
const limiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 20, standardHeaders: 'draft-7',
  legacyHeaders: false, keyGenerator: req => `${req.organization.id}:${req.user.id}`,
  message: { error: 'Too many design requests. Please try again shortly.' } });

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

module.exports = router;