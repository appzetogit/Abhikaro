import express from "express";
import { createCustomerContactMessage } from "../controllers/customerContactMessageController.js";

const router = express.Router();

router.post("/contact-us", createCustomerContactMessage);

export default router;

