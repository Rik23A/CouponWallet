# CouponVault Backend

This is the backend server for the CouponVault application, built with Node.js, Express, TypeScript, and MongoDB.

## 🚀 Features

- **Auth**: JWT-based authentication (Register, Login, Anonymous).
- **Gemini AI**: Smart coupon parsing from text/images.
- **Community**: Shared coupons repository.
- **Security**: Helmet, CORS, and Rate Limiting enabled.
- **Production Ready**: PM2 ecosystem config included.

## 🛠️ Local Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Environment Variables**:
   Copy `.env.example` to `.env` and fill in your credentials:
   - `MONGODB_URI`: Your MongoDB Atlas connection string.
   - `GEMINI_API_KEY`: Google Gemini API key.
   - `JWT_SECRET`: A long random string for token signing.

3. **Run in Development**:
   ```bash
   npm run dev
   ```

## 🌐 Hosting / Production Deployment

### Prerequisites
- Node.js (v18+)
- MongoDB (Atlas or local)
- PM2 (optional, for VPS hosting)

### Deployment Steps

1. **Build the project**:
   ```bash
   npm run build
   ```
   This generates the compiled code in the `dist` folder.

2. **Start the server**:
   - **Basic**: `npm start`
   - **With PM2 (Recommended)**: `npm run pm2:start`

3. **Verify Deployment**:
   Check the health endpoint: `GET /api/health`

## ☁️ Deploying to Render.com

1. **Connect GitHub**: Push your code to a GitHub repository.
2. **Create Web Service**:
   - Log in to [Render](https://render.com).
   - Click **New +** > **Web Service**.
   - Connect your repository.
3. **Configure**:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Environment Variables**: Add the variables listed in `.env.example`.
4. **Blueprint (Optional)**:
   - Render will automatically detect the `render.yaml` file if you use the "Blueprint" feature, which pre-fills all settings.


## 📁 Project Structure

- `src/index.ts`: Server entry point.
- `src/routes/`: API route handlers.
- `src/lib/`: Shared utilities (database, etc.).
- `dist/`: Compiled JavaScript (generated after build).
- `ecosystem.config.js`: PM2 configuration for production.
