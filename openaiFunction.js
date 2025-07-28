import { Client, Databases, Query } from "node-appwrite";
import OpenAI from "openai";

// Init Appwrite SDK
const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DB_ID = "6886dbd5003b445dffce";
const COLLECTION_ID = "6886dbe5000d34a52776";

// Helper: Create AI prompt
function createPrompt({ brand, product, tone, occasion, link }) {
  return `Generate 20 different short and engaging WhatsApp marketing messages for a brand called "${brand}", promoting the following product: "${product}".
Occasion: ${occasion}
Tone: ${tone}
${link ? `Include the link: ${link}` : ""}
Keep each message under 30 words, catchy, and conversational. Return only the messages as a plain numbered list.`;
}

export default async ({ req, res, log }) => {
  try {
    // Get the latest pending campaign
    const { documents } = await databases.listDocuments(DB_ID, COLLECTION_ID, [
      Query.equal("status", ["pending"]),
      Query.limit(1),
    ]);

    if (!documents.length) return res.json({ message: "No pending campaigns found." });

    const campaign = documents[0];

    // Build AI prompt
    const prompt = createPrompt({
      brand: campaign.brand,
      product: campaign.product,
      tone: campaign.tone,
      occasion: campaign.occasion,
      link: campaign.link,
    });

    // Generate 20 messages via OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
    });

    const rawOutput = completion.choices[0].message.content;
    const messages = rawOutput
      .split(/\d+\.\s/) // split by 1. 2. 3. etc.
      .filter(msg => msg.trim().length > 0)
      .map(msg => msg.trim());

    if (messages.length < 20) throw new Error("Less than 20 messages generated");

    // Update campaign document with messages
    await databases.updateDocument(DB_ID, COLLECTION_ID, campaign.$id, {
      messages: messages,
      status: "ready",
    });

    return res.json({ message: "Messages generated", count: messages.length });
  } catch (err) {
    console.error("OpenAI Function Error:", err);
    return res.json({ error: true, details: err.message });
  }
};
