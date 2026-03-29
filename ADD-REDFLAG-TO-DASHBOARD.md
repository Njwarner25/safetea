# Add Red Flag Scanner to Dashboard

The Red Flag Scanner page (`redflag.html`) exists but is not linked from the dashboard.
Add a tool card to the dashboard home page AND a hub sub-tab button.

---

## Step 1: Add Red Flag Scanner Tool Card to `dashboard.html`

Find this comment in the hub overview section (inside `id="hub-overview"`):

```html
<!-- Safety Search -->
```

Add this **BEFORE** it (right after the Date Check-In card):

```html
                    <!-- Red Flag Scanner -->
                    <a href="/redflag.html" style="text-decoration:none;display:flex;align-items:center;gap:16px;background:linear-gradient(135deg,rgba(231,76,60,0.08),rgba(231,76,60,0.02));border:1px solid rgba(231,76,60,0.15);border-radius:14px;padding:18px 20px;margin-bottom:12px;cursor:pointer;transition:all 0.2s" onmouseover="this.style.transform='translateY(-1px)';this.style.borderColor='rgba(231,76,60,0.35)'" onmouseout="this.style.transform='none';this.style.borderColor='rgba(231,76,60,0.15)'">
                        <div style="min-width:44px;height:44px;background:rgba(231,76,60,0.12);border-radius:12px;display:flex;align-items:center;justify-content:center"><span style="font-size:22px">🚩</span></div>
                        <div style="flex:1">
                            <h4 class="home-card-title" style="color:#fff;font-size:15px;font-weight:600;margin-bottom:4px">Red Flag Scanner</h4>
                            <p class="home-card-desc" style="color:#8080A0;font-size:12px;line-height:1.5;margin:0">AI-powered dating safety scan. Search a name and get instant red flag analysis from community data.</p>
                        </div>
                        <span style="flex-shrink:0;font-size:11px;font-weight:600;padding:4px 10px;border-radius:6px;background:rgba(232,160,181,0.15);color:#E8A0B5">AI</span>
                    </a>
```

---

## Step 2: Add hub sub-tab button (optional, for consistency)

Find the hub-tabs `<div>` that contains buttons like `data-hubsub="namewatch"`. Add this button at the end, before the closing `</div>`:

```html
                <a href="/redflag.html" class="hub-tab" style="background:#22223A;color:#8080A0;border:1px solid rgba(255,255,255,0.08);padding:10px 18px;border-radius:10px;font-size:13px;font-weight:500;cursor:pointer;font-family:'Inter',sans-serif;text-decoration:none"><span style="margin-right:4px">🚩</span> Red Flag Scanner</a>
```

---

That's it! The `redflag.html` page already has the full UI and JS — it just needs a link from the dashboard.
