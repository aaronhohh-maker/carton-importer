import Anthropic from '@anthropic-ai/sdk'

export interface RawContent {
  title: string
  description: string      // raw scraped text from noissue
  imageUrls: string[]
  categoryName: string
}

export interface ProcessedContent {
  description: string      // rewritten in +Carton's brand voice
  seoTitle: string         // under 60 chars, keyword-relevant
  seoDescription: string   // under 160 chars, compelling
  imageAltTexts: string[]  // one per imageUrl, descriptive + accessible
}

const SYSTEM_PROMPT = `You are a copywriter for +Carton, a Shopify app that helps small food & beverage businesses and cafés import packaging products from noissue.co into their store.

Your job is to rewrite raw product content in +Carton's brand voice: friendly, approachable, and warm. Write as if you're talking to a small café owner or artisan food producer who cares deeply about how their packaging looks to customers. Focus on how the packaging helps their brand look good and make a great impression. Avoid corporate jargon, generic marketing speak, or overly formal language.

When you rewrite descriptions:
- Lead with the benefit to the business owner and their customers
- Keep it conversational and enthusiastic but not over-the-top
- Highlight eco-friendly or customisation aspects when mentioned in the source
- Aim for 2–4 sentences, clear and scannable

When you write SEO fields:
- seoTitle: under 60 characters, include the product name and a key benefit keyword
- seoDescription: under 160 characters, compelling, include a call to action or benefit

When you write alt text:
- Be descriptive and accessible (describe what's actually in the image)
- Include the product name naturally
- Keep each alt text under 125 characters

You must always respond with valid JSON only — no markdown fences, no preamble. The JSON must match this exact shape:
{
  "description": "string",
  "seoTitle": "string",
  "seoDescription": "string",
  "imageAltTexts": ["string", ...]
}`

export async function processContent(raw: RawContent): Promise<ProcessedContent> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set')
  }

  const client = new Anthropic({ apiKey })

  const userPrompt = `Product title: ${raw.title}
Category: ${raw.categoryName}
Raw description from noissue:
${raw.description}

Image URLs (write one alt text per image, in order):
${raw.imageUrls.map((url, i) => `${i + 1}. ${url}`).join('\n')}

Rewrite the description in +Carton's brand voice, generate SEO fields, and write alt text for each image. Return valid JSON only.`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
  })

  const textBlock = response.content.find((block) => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text content in Claude response')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(textBlock.text)
  } catch {
    throw new Error(`Failed to parse Claude response as JSON: ${textBlock.text.slice(0, 200)}`)
  }

  // Validate the parsed object matches ProcessedContent shape
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).description !== 'string' ||
    typeof (parsed as Record<string, unknown>).seoTitle !== 'string' ||
    typeof (parsed as Record<string, unknown>).seoDescription !== 'string' ||
    !Array.isArray((parsed as Record<string, unknown>).imageAltTexts)
  ) {
    throw new Error('Claude response does not match expected ProcessedContent shape')
  }

  const result = parsed as ProcessedContent

  // Ensure imageAltTexts has the correct length — pad or trim to match imageUrls
  if (result.imageAltTexts.length < raw.imageUrls.length) {
    while (result.imageAltTexts.length < raw.imageUrls.length) {
      result.imageAltTexts.push(`${raw.title} product image`)
    }
  } else if (result.imageAltTexts.length > raw.imageUrls.length) {
    result.imageAltTexts = result.imageAltTexts.slice(0, raw.imageUrls.length)
  }

  return result
}
