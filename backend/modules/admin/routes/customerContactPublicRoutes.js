import express from "express";
import { authenticate } from "../../auth/middleware/auth.js";
import { createCustomerContactMessage } from "../controllers/customerContactMessageController.js";

const router = express.Router();

router.post("/contact-us", authenticate, createCustomerContactMessage);

export default router;

