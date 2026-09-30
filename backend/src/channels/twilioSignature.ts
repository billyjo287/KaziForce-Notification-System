// Checks that a webhook really comes from Twilio (X-Twilio-Signature). Twilio signs the full URL
// it called plus every POST field sorted by name, with HMAC-SHA1 and the account's auth token:
// https://www.twilio.com/docs/usage/webhooks/webhooks-security
import { createHmac, timingSafeEqual } from 'node:crypto';

export function twilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((key) => key + params[key])
      .join('');
  return createHmac('sha1', authToken).update(data, 'utf8').digest('base64');
}

export function isValidTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string | undefined,
): boolean {
  if (!signature) return false;
  const expected = Buffer.from(twilioSignature(authToken, url, params));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
