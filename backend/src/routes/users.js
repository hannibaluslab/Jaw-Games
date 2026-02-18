const express = require('express');
const UserController = require('../controllers/userController');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Public routes
router.get('/', UserController.listUsers);
router.get('/address/:address', UserController.getUserByAddress);
router.put('/address/:address/username', UserController.updateUsername);
router.get('/:username', UserController.getUser);
router.post('/register', UserController.registerUser);
router.get('/:username/check', UserController.checkUsername);

// Protected routes
router.get('/:username/matches', authMiddleware, UserController.getUserMatches);
router.get('/:username/balance', authMiddleware, UserController.getUserBalance);

module.exports = router;
