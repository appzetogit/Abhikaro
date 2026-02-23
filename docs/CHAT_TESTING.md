# Real-time Chat – How to Test

## Bugs fixed (audit)

- **User OrderChat**: `mongoOrderId` was used in `useRef(mongoOrderId)` before it was declared (would throw in strict mode). Fixed by declaring `useState(mongoOrderId)` before the refs.
- **Backend getChatMessages**: Unread filter compared `msg.receiverId.toString()` to `userId` (ObjectId). Fixed by using `userIdStr` and `msg.receiverId?.toString()`.
- **new-message handler**: Added null checks for `data?.message`, safe `orderId`/`_id` normalization (`?.toString?.()`), and return same state when message already exists to avoid unnecessary re-renders.
- **Backend sendMessage**: Wrapped socket emit in try/catch so a socket error does not block the HTTP 201 response; message is always saved first.
- **formatTime**: Guard for missing `timestamp` so `new Date(undefined)` is not used.

## 1. Prerequisites

- Backend and frontend run with correct env so the **socket URL points to your backend** (not localhost in production).

### Local testing

- **Backend** `.env`: no change needed (runs on `http://localhost:5000`).
- **Frontend** `.env`:  
  `VITE_API_BASE_URL=http://localhost:5000/api`  
  So socket URL = `http://localhost:5000`.

### Production testing

- **Frontend** (build): set `VITE_API_BASE_URL=https://your-api-domain.com/api` (HTTPS).
- **Backend** `.env`: set `CORS_ORIGIN` or `FRONTEND_URL` to your frontend origin (e.g. `https://foods.abhikaro.in`).

---

## 2. Start the app

```bash
# Terminal 1 – backend
cd backend
npm run dev

# Terminal 2 – frontend
cd frontend
npm run dev
```

- User app: open in browser (e.g. `http://localhost:5173`).
- Delivery app: open in another browser or incognito (e.g. `http://localhost:5173/delivery`).

---

## 3. Test scenarios

### A. Send message → appears instantly

1. **User**: Log in, place an order (or use an existing order that has a delivery partner).
2. **User**: Open that order → open **Chat** (with delivery partner).
3. **Delivery**: Log in as delivery, accept/open the same order → open **Chat**.
4. **User**: Type a message and send.
5. **Check**: Message appears on **delivery** side **without refresh**.
6. **Delivery**: Reply.
7. **Check**: Reply appears on **user** side **without refresh**.

If both see messages immediately, the test passes.

---

### B. Refresh page → old messages load

1. With chat open and a few messages already sent:
2. **Refresh the page** (F5 or Ctrl+R).
3. **Check**:  
   - Old messages load from API.  
   - In browser console you see something like `[Chat] Socket connected` and `[Chat] Emit join-chat ...`.  
   - Send a new message; the other side still gets it in real time.

---

### C. Close chat popup → reopen → no duplicate join

1. **User**: Open order → open Chat (popup/overlay).
2. In console, note one set of join logs (e.g. `[Chat] Emit join-chat ...`).
3. **Close** the chat popup (X or back).
4. **Reopen** the same order’s chat.
5. **Check**:  
   - You see a **single** new connection and one set of join logs (no repeated joins for the same room).  
   - Sending/receiving still works.

---

### D. Network slow / reconnect

1. Open chat and confirm messages work.
2. **Chrome**: DevTools (F12) → **Network** tab → set throttling to **Slow 3G** (or **Offline** for a few seconds).
3. Send a message (may take a while or fail temporarily).
4. **Turn throttling back to No throttling** (or go back online).
5. **Check**:  
   - In console you see `[Chat] Socket disconnected` then `[Chat] Socket reconnected` (and possibly `[Chat] Reconnect attempt`).  
   - After reconnect, new messages again appear on both sides without refresh.

---

### E. Delivery + user both receive instantly

- Same as **A**: user and delivery both have chat open for the same order; messages sent by either appear on the other side immediately.  
- If both receive in real time, this test passes.

---

## 4. Where to look

### Browser console (frontend)

- `[Chat] Socket URL: ...` – confirms socket is using the right backend URL.
- `[Chat] Socket connected` – connection established.
- `[Chat] Emit join-chat ...` / `[Chat] Emit join-chat (mongo) ...` – room join.
- `[Chat] new-message` – received real-time message (in dev).
- `[Chat] Socket disconnected` / `[Chat] Socket reconnected` – disconnect and reconnect.

### Backend terminal

- `[Socket] Client connected: <id> origin: ...` – client connected.
- `[Socket] join-chat: order:...` – client joined chat room.
- `[Chat] Emitted new-message to order/user/delivery rooms` – message saved and broadcast.

---

## 5. Quick checklist

| # | Test | Pass? |
|---|------|--------|
| 1 | Send message → appears instantly on the other side | ☐ |
| 2 | Refresh page → old messages load, new ones still real time | ☐ |
| 3 | Close chat popup → reopen → no duplicate join, chat works | ☐ |
| 4 | Throttle/offline → reconnect → messages work again | ☐ |
| 5 | User and delivery both receive messages instantly | ☐ |

If all 5 pass, real-time chat is working as intended.
