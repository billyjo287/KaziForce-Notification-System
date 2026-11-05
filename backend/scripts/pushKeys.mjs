// Makes a key pair for browser pop-ups (Web Push, ADR 0017). Paste both lines into backend/.env
// (and deploy/azure/.env on the server). The private key is a secret: never commit it.
import webpush from 'web-push';

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
