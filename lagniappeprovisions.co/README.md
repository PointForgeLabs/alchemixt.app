# lagniappeprovisions.co

Marketing website for **Lagniappe Provisions** — a static, dependency-free site
(plain HTML/CSS, no build step) designed to be served by GitHub Pages at
https://lagniappeprovisions.co.

## Contents

| File | Purpose |
|---|---|
| `index.html` | Landing page: hero, lagniappe definition, provisions, story, email signup |
| `styles.css` | All styling (Fraunces + Inter, cream/bayou-green/brass palette) |
| `404.html` | Custom not-found page (GitHub Pages picks this up automatically) |
| `favicon.svg` | Monogram favicon |
| `CNAME` | Custom-domain binding for GitHub Pages |
| `robots.txt`, `sitemap.xml` | Basic SEO plumbing |

## Moving this into its own repository

This directory is fully self-contained. From a machine with repo-creation rights:

```bash
# 1. Create the empty repo on GitHub (no README), e.g. PointForgeLabs/lagniappeprovisions.co
# 2. Then:
git clone --branch claude/lagniappeprovisions-marketing-site-3i6fqc \
  https://github.com/PointForgeLabs/alchemixt.app tmp-src
mkdir lagniappeprovisions.co && cp -r tmp-src/lagniappeprovisions.co/* lagniappeprovisions.co/
cd lagniappeprovisions.co
git init -b main && git add -A && git commit -m "Initial site"
git remote add origin https://github.com/PointForgeLabs/lagniappeprovisions.co.git
git push -u origin main
```

## Deploying with GitHub Pages

1. In the new repo: **Settings → Pages → Source: Deploy from a branch**, branch
   `main`, folder `/ (root)`.
2. Under **Custom domain**, enter `lagniappeprovisions.co` (the `CNAME` file in
   this repo keeps it pinned). Enable **Enforce HTTPS** once the cert issues.
3. At your DNS provider, point the domain at GitHub Pages:
   - Four `A` records on the apex (`@`): `185.199.108.153`, `185.199.109.153`,
     `185.199.110.153`, `185.199.111.153`
   - Optional `www` `CNAME` record → `pointforgelabs.github.io`

## Things to customize

- **Signup form**: set `FORM_ENDPOINT` in `index.html` to a Formspree/Buttondown
  endpoint. Until then, the form falls back to opening a pre-filled email to
  `hello@lagniappeprovisions.co`.
- **Contact email**: `hello@lagniappeprovisions.co` appears in `index.html`
  (config block, footer, JSON-LD) — update if you use a different address.
- **Copy**: the product categories (pantry staples, spice & seasoning, gift
  boxes) and story text are a starting brand voice — swap in the real offering.
- **Analytics**: no tracker is installed; add a GA4 snippet in `<head>` if wanted.
- **OG image**: no `og:image` is set yet — add a 1200×630 image and the meta
  tags when brand art exists.
