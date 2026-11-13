import { Router } from "express";
import { auth } from "../middlewares/auth.middleware.js";
import {
    listNotifications,
    markRead,
    registerDevice,
    unreadCount,
    unregisterDevice,
} from "../controllers/notification.controller.js";

const notificationRouter = Router();

notificationRouter.use(auth);

notificationRouter.get("/", listNotifications);
notificationRouter.get("/unread-count", unreadCount);
notificationRouter.post("/read", markRead);
notificationRouter.post("/devices", registerDevice);
notificationRouter.delete("/devices", unregisterDevice);

export default notificationRouter;
