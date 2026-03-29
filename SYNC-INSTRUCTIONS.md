# Sync app.js and dashboard.html to safetea-landing

Run this in a terminal with SSH access to both repos:

```bash
cd /tmp
git clone git@github.com:Njwarner25/safetea.git safetea-source
git clone git@github.com:Njwarner25/safetea-landing.git safetea-dest
cp safetea-source/app.js safetea-dest/app.js
cp safetea-source/dashboard.html safetea-dest/dashboard.html
cp safetea-source/services/rateLimit.js safetea-dest/services/rateLimit.js
cp safetea-source/api/screening/catfish.js safetea-dest/api/screening/catfish.js
cp safetea-source/api/screening/redflag.js safetea-dest/api/screening/redflag.js
cp safetea-source/api/posts/replies.js safetea-dest/api/posts/replies.js
cp safetea-source/api/posts/index.js safetea-dest/api/posts/index.js
cp safetea-source/api/auth/login.js safetea-dest/api/auth/login.js
cp safetea-source/api/auth/register.js safetea-dest/api/auth/register.js
cp safetea-source/api/feedback.js safetea-dest/api/feedback.js
cd safetea-dest
git add -A
git commit -m 'sync: app.js, dashboard.html, and all updated endpoints from safetea'
git push origin main
```
