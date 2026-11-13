import { enforceWebhookBackstop } from "@/server/services/rate-limit";
import { sayVoice } from "@/server/services/twilio/voice-config";
import { verifyTwilioVoiceSignature } from "@/server/services/twilio/voice-signature";
import { buildHangupTwiml, buildOwnerLineUnavailableTwiml, twimlResponse } from "@/server/services/twilio/voice-twiml";

export const dynamic = "force-dynamic";

/**
 * The <Dial> action of an owner-line call (docs/owner-line.md). Twilio requests it when the SIP
 * leg to the owner's assistant ends:
 *
 *   DialCallStatus=completed  they talked → <Hangup/>.
 *   anything else             the assistant never picked up → say so and hang up. There is no
 *                             voicemail here: the caller is the owner, not a customer, and
 *                             nothing was recorded as a missed call.
 *
 * Signature-verified (the signed URL includes ?event=dial).
 */
export async function POST(request: Request): Promise<Response> {
  const backstop = await enforceWebhookBackstop(request, "twilio_voice_owner_line");
  if (backstop) return backstop;

  const rawBody = await request.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody));
  if (!verifyTwilioVoiceSignature(request, params, request.headers.get("x-twilio-signature"), process.env.TWILIO_AUTH_TOKEN)) {
    return new Response("Invalid signature.", { status: 403 });
  }
  const status = (params.DialCallStatus ?? "").toLowerCase();
  if (status === "completed") return twimlResponse(buildHangupTwiml());
  console.warn(`[owner-line] assistant leg ended '${status || "unknown"}' (SIP ${params.DialSipResponseCode ?? "?"}).`);
  return twimlResponse(buildOwnerLineUnavailableTwiml(sayVoice()));
}
