// Masked addresses for screens and logs ("w•••@gmail.com", "07•• ••• 678"): enough to recognise,
// not enough to contact anyone (Kenya Data Protection Act: data minimisation, BT-04).

export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, local.length > 3 ? 2 : 1)}•••@${domain}`;
}

/** An E.164 Kenyan number (+2547...) shown the way people write it, mostly hidden. */
export function maskPhone(phone: string): string {
  return `0${phone.slice(4, 5)}•• ••• ${phone.slice(-3)}`;
}

/** Any address a channel sends to: email, phone, or "whatsapp:+254..." (for log lines). */
export function maskAddress(address: string): string {
  if (address.includes('@')) return maskEmail(address);
  const phone = address.replace(/^whatsapp:/, '');
  return /^\+\d{8,15}$/.test(phone) ? maskPhone(phone) : '•••';
}
