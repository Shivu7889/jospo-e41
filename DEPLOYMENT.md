# Jospo E41 - Production Deployment Guide

This guide walks you through deploying the **Jospo E41 Manufacturing & Stock Management System** to production on **Vercel** with **Supabase**.

---

## Prerequisites Checklist

- [x] Next.js production build passes (`npm run build` succeeds with zero errors)
- [x] Git repository initialized with clean working tree
- [x] Security policies & RLS configured in Supabase
- [x] `.env.local` excluded in `.gitignore`
- [ ] Supabase project URL & publishable key ready
- [ ] Vercel account created ([vercel.com/signup](https://vercel.com/signup))

---

## Method 1: Deploy with GitHub + Vercel (Recommended)

This is the easiest and most reliable method. It gives you automatic deployments whenever you update your code.

### Step 1: Push Code to GitHub

1. Create a new repository on [GitHub](https://github.com/new):
   - Name: `jospo-e41`
   - Visibility: **Private** (recommended)
   - Do **NOT** initialize with README or license (we already have them)

2. Link your local repository and push:
   ```bash
   cd /Users/shivampatidar/.gemini/antigravity/scratch/jospo-e41
   git remote add origin https://github.com/YOUR_USERNAME/jospo-e41.git
   git branch -M main
   git push -u origin main
   ```

### Step 2: Import Project on Vercel

1. Go to [vercel.com/new](https://vercel.com/new).
2. Choose **"Import Git Repository"** and select `jospo-e41`.
3. Under **Framework Preset**, select **Next.js** (auto-detected).
4. Expand **Environment Variables** and add these two:
   | Key | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://egumwbmnvxemxousaujj.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_CyvFW3O3SiE3LjwvN4RqFA_TfGAjmcX` |
5. Click **"Deploy"**.

Within ~60 seconds, Vercel will build and provide your live production URL (e.g. `https://jospo-e41.vercel.app`)!

---

## Method 2: Deploy directly via Vercel CLI

If you don't want to use GitHub:

1. In your terminal, run:
   ```bash
   cd /Users/shivampatidar/.gemini/antigravity/scratch/jospo-e41
   npx vercel
   ```
2. Follow the interactive prompts:
   - Log in or sign up when prompted
   - Set up and deploy: **Y**
   - Which scope: Select your personal account
   - Link to existing project: **N**
   - Project name: `jospo-e41`
   - Directory: `./`
3. Add production environment variables:
   ```bash
   npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
   npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
   ```
4. Deploy to production:
   ```bash
   npx vercel --prod
   ```

---

## Supabase Production Configuration

Once deployed, make sure your Supabase project redirects to your live Vercel domain:

1. Open your [Supabase Dashboard](https://supabase.com/dashboard/project/egumwbmnvxemxousaujj).
2. Go to **Authentication** → **URL Configuration**.
3. Set **Site URL** to your Vercel URL (e.g., `https://jospo-e41.vercel.app`).
4. In **Redirect URLs**, add:
   - `https://jospo-e41.vercel.app/**`
   - `http://localhost:3000/**` (so local development continues working)
5. Click **Save**.

---

## Live System Verification

After deployment, test the full production loop:
1. Visit your live URL and log in as `admin@jospo.com`.
2. Check that the **Dashboard** shows live inventory counts.
3. Open on your mobile phone: go to **Dispatch** → **New Dispatch** and scan a cooler model QR code with your phone camera.
4. Verify stock decreases in real-time!
