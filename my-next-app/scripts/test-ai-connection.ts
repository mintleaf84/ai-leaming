
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import * as dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function test() {
  const apiKey = process.env.AI_API_KEY || '';
  const apiUrl = process.env.AI_API_URL || 'https://api.openai.com/v1';
  const modelName = 'gpt-4o-mini';

  console.log(`Testing with URL: ${apiUrl}`);
  console.log(`API Key starts with: ${apiKey.substring(0, 5)}...`);

  try {
    const openai = createOpenAI({
      apiKey,
      baseURL: apiUrl,
    });

    const model = openai(modelName);

    const { text } = await generateText({
      model,
      messages: [{ role: 'user', content: "Respond with 'Pong'" }],
    });

    console.log('Success!', text);
  } catch (error) {
    console.error('Failed!', error);
  }
}

test();
