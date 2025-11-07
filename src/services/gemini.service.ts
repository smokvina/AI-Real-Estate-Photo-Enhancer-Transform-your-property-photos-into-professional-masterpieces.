import { Injectable } from '@angular/core';
import { GoogleGenAI } from '@google/genai';

@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  private readonly ai: GoogleGenAI;
  
  constructor() {
    // IMPORTANT: The API_KEY is injected via environment variables and is not hardcoded.
    // This is a placeholder for the Applet environment.
    const apiKey = (window as any).process?.env?.API_KEY ?? '';
    if (!apiKey) {
      console.error("API_KEY is not set. Please configure it in your environment.");
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  async analyzeImage(base64ImageData: string): Promise<{ suggestions: string, prompt: string }> {
    const systemInstruction = `You are an expert AI assistant specializing in real estate photography analysis. Your primary goal is to help users improve their property photos by generating a new version that looks professionally shot, while keeping the content and composition identical to the original.

      Analyze the provided image and generate two things:
      1. Suggestions: A bulleted list of 3-5 key improvements that a professional photographer would make, focusing on aspects like lighting, color balance, and sharpness. This is for the user's information. Use Markdown for formatting.
      2. Prompt: A highly detailed, single-paragraph descriptive prompt for an image generation AI. This prompt MUST be a literal and precise description of the original image's contents, layout, furniture, textures, colors, and the exact camera perspective. Do not add, remove, or change any objects in the scene. The objective is to describe the scene with such high fidelity that the generated image is a photorealistic, professionally-styled version of the original, not a reimagining. Start this part with the exact phrase "PROMPT:".
      
      Example response format:
      *   **Enhance Lighting:** The image would be improved with brighter, more natural light to illuminate the entire space evenly.
      *   **Boost Colors:** Increase color saturation slightly to make the room feel more vibrant and inviting.
      *   **Increase Sharpness:** Sharpening the image will bring out the details in the furniture and textures.
      PROMPT: A photograph of a living room from a straight-on, eye-level perspective. In the center is a low, dark brown wooden coffee table with a small white vase on it. Behind the table is a light grey fabric sofa with two white cushions on the left and one on the right. A large, framed abstract painting with blue and gold tones hangs on the white wall above the sofa. To the left of the sofa, there's a tall green potted plant in a black ceramic pot. Sunlight is coming from a large window that is out of frame to the right, casting soft light across the wooden floor.`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64ImageData,
            },
          },
        ],
      },
      config: {
        systemInstruction,
      }
    });

    const responseText = response.text;
    const promptIndex = responseText.indexOf('PROMPT:');

    if (promptIndex === -1) {
      throw new Error('AI response did not follow the expected format.');
    }

    const suggestions = responseText.substring(0, promptIndex).trim();
    const prompt = responseText.substring(promptIndex + 'PROMPT:'.length).trim();
    
    return { suggestions, prompt };
  }

  async generateProfessionalImage(prompt: string): Promise<string> {
    const fullPrompt = `${prompt}, interior design, real estate photography, high resolution, 4k, professional lighting, photorealistic`;

    const response = await this.ai.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: fullPrompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/png',
          aspectRatio: '16:9',
        },
    });

    if (response.generatedImages && response.generatedImages.length > 0) {
      return response.generatedImages[0].image.imageBytes;
    } else {
      throw new Error('Image generation failed or returned no images.');
    }
  }
}
