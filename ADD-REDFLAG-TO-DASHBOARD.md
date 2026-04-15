# Add Conversation Scanner to Dashboard

The Conversation Scanner (`redflag.html`) lets users upload a conversation (paste text
or screenshot) and AI analyzes the man's messages for red flags, yellow flags,
green flags, manipulation tactics, and his likely motive.

## Add Tool Card to `dashboard.html`

Find `<!-- Safety Search -->` in the hub overview. Add this **BEFORE** it:

```html
<!-- Conversation Scanner -->
<a href="/redflag.html" style="text-decoration:none;display:flex;align-items:center;gap:16px;background:linear-gradient(135deg,rgba(231,76,60,0.08),rgba(231,76,60,0.02));border:1px solid rgba(231,76,60,0.15);border-radius:14px;padding:18px 20px;margin-bottom:12px;cursor:pointer;transition:all 0.2s" onmouseover="this.style.transform='translateY(-1px)';this.style.borderColor='rgba(231,76,60,0.35)'" onmouseout="this.style.transform='none';this.style.borderColor='rgba(231,76,60,0.15)'">
    <div style="min-width:44px;height:44px;background:rgba(231,76,60,0.12);border-radius:12px;display:flex;align-items:center;justify-content:center"><span style="font-size:22px">🚩</span></div>
    <div style="flex:1">
        <h4 class="home-card-title" style="color:#fff;font-size:15px;font-weight:600;margin-bottom:4px">Conversation Scanner</h4>
        <p class="home-card-desc" style="color:#8080A0;font-size:12px;line-height:1.5;margin:0">Upload a conversation and AI will analyze his messages for red flags, manipulation tactics, and true motives.</p>
    </div>
    <span style="flex-shrink:0;font-size:11px;font-weight:600;padding:4px 10px;border-radius:6px;background:rgba(232,160,181,0.15);color:#E8A0B5">AI</span>
</a>
```

Also copy `redflag.html` and `api/screening/redflag.js` to `safetea-landing`.
