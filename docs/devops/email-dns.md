# Email DNS Configuration Guide (SPF, DKIM, DMARC)

Proper DNS setup is essential to ensure transactional emails sent by Notica reach the inbox instead of spam folders. Major email providers (Google, Yahoo, Microsoft) enforce strict sender authentication.

---

## 1. Domain Best Practice

Instead of sending from your apex domain (`yourdomain.com`), send transactional mail from a dedicated subdomain:
`mail.yourdomain.com` or `notifications.yourdomain.com`.

This isolates your transactional reputation from marketing campaigns or corporate mailboxes.

Set `EMAIL_FROM`:
```env
EMAIL_FROM="Notica <notifications@mail.yourdomain.com>"
```

---

## 2. SPF (Sender Policy Framework)

SPF declares which mail servers are authorized to send emails on behalf of your domain.

Add a TXT record for your sending domain:

### For Resend
Resend manages SPF on a dedicated bounce subdomain (e.g. `bounces.mail.yourdomain.com`). Follow the MX / TXT records provided in the Resend dashboard.

### For Custom SMTP / Amazon SES
Add or update the TXT record on your sending host:
```text
Host: mail.yourdomain.com (or @)
Type: TXT
Value: v=spf1 include:amazonses.com ~all
```
*(Replace `amazonses.com` with your SMTP provider's SPF include mechanism).*

---

## 3. DKIM (DomainKeys Identified Mail)

DKIM signs every outgoing email cryptographically so the receiver knows the message was not tampered with in transit.

1. **In Resend / Provider Dashboard**: Navigate to Domains → Add Domain.
2. The dashboard will generate 2 or 3 `CNAME` records:
   ```text
   resend._domainkey.mail.yourdomain.com  CNAME  ...
   ```
3. Add these records in your DNS provider (Cloudflare, Route53, Namecheap, etc.).

---

## 4. DMARC (Domain-based Message Authentication, Reporting, and Conformance)

DMARC tells receiving servers what to do if an email claims to come from your domain but fails SPF or DKIM.

Add a TXT record at `_dmarc.yourdomain.com`:

### Phase 1: Monitoring Mode (p=none)
Start here for 2–4 weeks to monitor deliverability without rejecting legitimate mail:
```text
Host: _dmarc.mail.yourdomain.com (or _dmarc.yourdomain.com)
Type: TXT
Value: v=DMARC1; p=none; rua=mailto:dmarc-reports@yourdomain.com; pct=100; adkim=r; aspf=r
```

### Phase 2: Enforcement (p=quarantine or p=reject)
Once you confirm that SPF and DKIM pass with 100% alignment:
```text
Value: v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@yourdomain.com; pct=100
```

---

## 5. Verifying Your Records

Run these checks in your terminal to verify DNS propagation:

```bash
# Check SPF
nslookup -type=txt mail.yourdomain.com

# Check DKIM
nslookup -type=cname resend._domainkey.mail.yourdomain.com

# Check DMARC
nslookup -type=txt _dmarc.mail.yourdomain.com
```

---

## 6. Bounce & Complaint Webhooks

In production with Resend:
1. Configure webhook in the Resend dashboard:
   - Endpoint URL: `https://api.yourdomain.com/webhooks/email/resend`
   - Events: `email.delivered`, `email.bounced`, `email.complained`, `email.delivery_delayed`
2. Copy the Signing Secret to:
   ```env
   RESEND_WEBHOOK_SECRET="whsec_..."
   ```
Notica will automatically verify signatures via Svix headers and mark bounced/complained addresses as suppressed.
