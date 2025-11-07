
import { Injectable } from '@angular/core';
import { GoogleGenAI, Type } from '@google/genai';

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
    // Updated system instruction based on user's prompt
    const systemInstruction = `Tvoja uloga i zadatak: Ponašaj se kao svjetski stručnjak za obradu fotografija—profesionalni fotograf i grafički dizajner s 20 godina iskustva u post-produkciji i radu s Photoshopom.
Ulaz: Dobit ćeš fotografiju koju je učitao korisnik.
Tvoj jedini zadatak: Analiziraj i poboljšaj ovu fotografiju. Tvoja obrada mora se fokusirati isključivo na poboljšanje tehničkih i estetskih aspekata slike, kao što su:
Osvjetljenje: Balansiraj ekspoziciju, sjene (shadows) i svijetle dijelove (highlights).
Boje: Ispravi balans bijele boje (white balance), poboljšaj živost (vibrance) i zasićenost (saturation) na prirodan način.
Kontrast: Fino podesi kontrast kako bi slika dobila dubinu.
Oštrina: Pažljivo poboljšaj oštrinu (sharpening) i jasnoću (clarity) bez stvaranja artefakata.
Smanjenje šuma: Ako je prisutan, smanji digitalni šum (noise reduction).
NAJVAŽNIJA OGRANIČENJA (Apsolutna zabrana):
NE SMIJEŠ mijenjati kompoziciju.
NE SMIJEŠ dodavati, uklanjati, premještati ili mijenjati veličinu bilo kojeg elementa na slici (npr. namještaj, zidove, ukrase, osobe).
NE SMIJEŠ izmišljati nove detalje, objekte ili teksture koji ne postoje u originalnoj fotografiji.
NE SMIJEŠ mijenjati geometriju, proporcije ili raspored elemenata.
Rezultat: Unaprijeđena slika mora biti 100% JEDNAKA korisnikovoj originalnoj fotografiji u smislu sadržaja, rasporeda i geometrije. Jedina razlika smije biti u profesionalnoj obradi svjetla, boje i oštrine. Obradi sliku, nemoj je mijenjati.
Output mora biti u JSON formatu. Koristi sljedeću shemu:
`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg', // Assuming JPEG for simplicity, can be dynamic
              data: base64ImageData,
            },
          },
        ],
      },
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestions: {
              type: Type.STRING,
              description: 'Markdown formatted list of 3-5 key improvements a professional photographer would make, focusing on lighting, color balance, and sharpness.',
            },
            prompt: {
              type: Type.STRING,
              description: 'A very detailed, single-paragraph descriptive prompt for an AI image generation model (like Imagen 3.0). This prompt MUST be a literal and precise description of the content, layout, furniture, textures, colors, and exact camera perspective of the original image. Do not add, remove, or change objects in the scene. The goal is to describe the scene with such high fidelity that the generated image is a photorealistic, professionally stylized version of the original, not a new imagining.',
            },
          },
          propertyOrdering: ["suggestions", "prompt"],
        },
      }
    });

    const jsonStr = response.text.trim();
    const result = JSON.parse(jsonStr);
    
    return { suggestions: result.suggestions, prompt: result.prompt };
  }

  async generateImageEditPrompt(base64ImageData: string, editInstruction: string): Promise<string> {
    const systemInstruction = `You are a sophisticated AI assistant specializing in transforming image descriptions. You will receive an image and a user's instruction for editing it. Your task is to analyze the image, incorporate the user's editing request, and then produce a *single, comprehensive text prompt* that describes the *new, modified image*. This prompt will be used by an image generation AI (like Imagen 3.0) to create the edited image. Ensure the prompt is highly detailed, photorealistic, and accurately reflects both the original image's content (unless explicitly modified by the edit) and the user's specific edit. Maintain the overall composition, perspective, and style unless the edit instruction explicitly overrides it. The output must ONLY be the new image generation prompt, prefixed with 'EDITED_PROMPT:'.`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash', // As per user's request for "Gemini 2.5 Flash Image to generate"
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg', // Assuming JPEG
              data: base64ImageData,
            },
          },
          {
            text: `User wants to apply the following edit to the provided image: "${editInstruction}". Generate a detailed image generation prompt for this modified image.`
          }
        ],
      },
      config: {
        systemInstruction,
        responseMimeType: "text/plain", // Expecting plain text output for the prompt
      }
    });

    const responseText = response.text;
    const promptPrefix = 'EDITED_PROMPT:';
    const promptIndex = responseText.indexOf(promptPrefix);

    if (promptIndex === -1) {
      throw new Error('AI response for edit prompt did not follow the expected format.');
    }

    return responseText.substring(promptIndex + promptPrefix.length).trim();
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
    