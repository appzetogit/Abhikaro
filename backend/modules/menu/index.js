// Menu module - to be implemented
import express from 'express';

// Controllers
import { suggestUnifiedSearch, legacyMenuSearch } from './searchController.js';

const router = express.Router();

// Health for module
router.get('/', (req, res) => {
  res.status(200).json({ success: true, message: 'Menu module ready' });
});

// New unified suggest endpoint (foods, restaurants, categories)
router.get('/search/suggest', suggestUnifiedSearch);

// Backward-compatible endpoint used by frontend today (foods only)
router.get('/search', legacyMenuSearch);

export default router;


