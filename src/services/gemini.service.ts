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

  /**
   * Helper to get image information (mimeType, aspectRatio) from a base64 data URL.
   * @param base64DataUrl The full base64 data URL (e.g., data:image/jpeg;base64,...)
   * @returns A promise resolving to an object containing mimeType and aspectRatio.
   */
  public _getImageInfoFromBase64(base64DataUrl: string): Promise<{ mimeType: string; aspectRatio: string; }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const width = img.width;
        const height = img.height;
        
        // Extract mimeType from the data URL
        const mimeTypeMatch = base64DataUrl.match(/^data:(image\/[a-zA-Z0-9\-\.]+);base64,/);
        const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg'; 

        let aspectRatio: string;
        const ratio = width / height;
        const tolerance = 0.05; // Tolerance for aspect ratio comparison

        // Supported aspect ratios for Imagen 3.0: "1:1", "3:4", "4:3", "9:16", "16:9"
        if (Math.abs(ratio - 1) < tolerance) {
          aspectRatio = '1:1';
        } else if (Math.abs(ratio - (4 / 3)) < tolerance) {
          aspectRatio = '4:3';
        } else if (Math.abs(ratio - (3 / 4)) < tolerance) {
          aspectRatio = '3:4';
        } else if (Math.abs(ratio - (16 / 9)) < tolerance) {
          aspectRatio = '16:9';
        } else if (Math.abs(ratio - (9 / 16)) < tolerance) {
          aspectRatio = '9:16';
        } else {
          // Fallback to 16:9 if no close match, common for web images/real estate
          aspectRatio = '16:9';
          console.warn(`Input image aspect ratio (${width}:${height}) did not closely match supported Imagen 3.0 ratios. Defaulting to 16:9.`);
        }
        resolve({ mimeType, aspectRatio });
      };
      img.onerror = (e) => reject(new Error(`Failed to load image from base64 data URL: ${e}`));
      img.src = base64DataUrl;
    });
  }

  async analyzeImage(base64DataUrl: string): Promise<{ suggestions: string, prompt: string, mimeType: string, aspectRatio: string }> {
    const { mimeType, aspectRatio } = await this._getImageInfoFromBase64(base64DataUrl);
    
    // Extract base64 part
    const base64ImageData = base64DataUrl.split(',')[1];

    // Updated system instruction based on user's latest prompt
    const systemInstruction = `Tvoja uloga i zadatak: Ponašaj se kao svjetski stručnjak za obradu fotografija—profesionalni fotograf i grafički dizajner s 20 godina iskustva u post-produkciji i radu s Photoshopom.
Ulaz: Dobit ćeš fotografiju koju je učitao korisnik.
Tvoj jedini zadatak: Analiziraj i poboljšaj ovu fotografiju. Tvoja obrada mora se fokusirati isključivo na poboljšanje tehničkih i estetskih aspekata slike, kao što su:
Osvjetljenje: Balansiraj ekspoziciju, sjene (shadows) i svijetle dijelove (highlights).
Boje: Ispravi balans bijele boje (white balance), poboljšaj živost (vibrance) i zasićenost (saturation) na prirodan način.
Kontrast: Fino podesi kontrast kako bi slika dobila dubinu.
Oštrina: Pažljivo poboljšaj oštrinu (sharpening) i jasnoću (clarity) bez stvaranja artefakata.
Smanjenje šuma: Ako je prisutan, smanji digitalni šum (noise reduction).
NAJVAŽNIJA OGRANIČENJA (Apsolutna zabrana):
ZABRANJENO MIJENJANJE KADRA (FRAMING): Apsolutno je zabranjeno rezati (crop), proširivati ili na bilo koji način mijenjati originalni kadar slike. Kadar mora ostati 100% identičan.
ZABRANJENO PRERASPOREĐIVANJE ELEMENATA: NE SMIJEŠ dodavati, uklanjati, premještati, preslagivati ili mijenjati veličinu bilo kojeg elementa na slici (npr. namještaj, zidove, ukrase, osobe).
ZABRANJENO GENERIRANJE (IZMIŠLJANJE): NE SMIJEŠ izmišljati nove detalje, objekte ili teksture koji ne postoje u originalnoj fotografiji.
ZABRANJENA PROMJENA GEOMETRIJE I KUTA: NE SMIJEŠ mijenjati geometriju, proporcije, perspektivu ili kut snimanja. Bilo kakva distorzija (npr. 'lens correction' koja mijenja izgled) je zabranjena.
Rezultat (Strogi kriteriji):
Vjernost sadržaja: Unaprijeđena slika mora biti 100% JEDNAKA korisnikovoj originalnoj fotografiji u smislu kadra, sadržaja, rasporeda elemenata, geometrije i kuta snimanja. Jedina razlika smije biti u profesionalnoj obradi svjetla, boje i oštrine.
Tehnička vjernost: Izlazna slika (output) mora biti u potpuno istom formatu datoteke (npr. JPG, PNG) i istim dimenzijama (rezoluciji) kao i originalna ulazna slika (input).
Naredba: Obradi sliku poštujući sva navedena ograničenja. Ne mijenjaj kadar. Ne mijenjaj elemente. Ne generiraj. Samo poboljšaj.
Output mora biti u JSON formatu. Koristi sljedeću shemu:
`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType, 
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
              description: 'Markdown formatted list of 3-5 key improvements a professional photographer would make, focusing on lighting, color balance, and sharpness, adhering to all output constraints.',
            },
            prompt: {
              type: Type.STRING,
              description: `A very detailed, single-paragraph descriptive prompt for an AI image generation model (like Imagen 3.0). This prompt MUST be a literal and precise description of the content, layout, furniture, textures, colors, and exact camera perspective of the original image. Do not add, remove, or change objects in the scene. The goal is to describe the scene with such high fidelity that the generated image is a photorealistic, professionally stylized version of the original, not a new imagining. The generated image MUST maintain the exact aspect ratio (${aspectRatio}) and be output in the same format (${mimeType}) as the original. All editing constraints (no cropping, no changing elements, no geometry changes, no generating new details) must be strictly followed.`,
            },
          },
          propertyOrdering: ["suggestions", "prompt"],
        },
      }
    });

    const jsonStr = response.text.trim();
    const result = JSON.parse(jsonStr);
    
    return { suggestions: result.suggestions, prompt: result.prompt, mimeType, aspectRatio };
  }

  async generateImageEditPrompt(base64DataUrl: string, editInstruction: string): Promise<string> {
    const { mimeType, aspectRatio } = await this._getImageInfoFromBase64(base64DataUrl);
    const base64ImageData = base64DataUrl.split(',')[1]; // Extract base64 part

    const systemInstruction = `You are a sophisticated AI assistant specializing in transforming image descriptions. You will receive an image and a user's instruction for editing it. Your task is to analyze the image, interpret the user's editing request *strictly within the bounds of a professional photo enhancer*, and then produce a *single, comprehensive text prompt* that describes the *new, modified image*. This prompt will be used by an image generation AI (like Imagen 3.0) to create the edited image.

IMPORTANT CONSTRAINTS (Absolute Prohibition) derived from the user's latest prompt:
- DO NOT CHANGE FRAMING: It is absolutely forbidden to crop, extend, or in any way change the original frame of the image. The frame must remain 100% identical.
- DO NOT REARRANGE ELEMENTS: You MUST NOT add, remove, move, rearrange, or change the size of any elements in the image (e.g., furniture, walls, decorations, people).
- DO NOT GENERATE (INVENT): You MUST NOT invent new details, objects, or textures that do not exist in the original photograph.
- DO NOT CHANGE GEOMETRY OR ANGLE: You MUST NOT change geometry, proportions, perspective, or shooting angle. Any distortion (e.g., 'lens correction' that changes appearance) is forbidden.

Your edits MUST focus exclusively on enhancing technical and aesthetic aspects like:
- Lighting: Balance exposure, shadows, and highlights.
- Colors: Correct white balance, enhance vibrancy and saturation naturally.
- Contrast: Finely adjust contrast for depth.
- Sharpness: Carefully enhance sharpness and clarity without artifacts.
- Noise Reduction: Reduce digital noise if present.

The generated prompt MUST be highly detailed, photorealistic, and accurately reflect both the original image's content and the user's specific edit, while *strictly adhering to all the above constraints*. If a user's edit request violates any of these absolute prohibitions (e.g., asking to remove an object), you MUST ignore that part of the request and only generate a prompt for permissible enhancements. For example, if the user asks to "remove the person in the background," your prompt should NOT include instructions to remove the person, but instead focus on other visual enhancements that are allowed.
The generated image MUST maintain the exact aspect ratio (${aspectRatio}) and be output in the same format (${mimeType}) as the original. The output must ONLY be the new image generation prompt, prefixed with 'EDITED_PROMPT:'.`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash', 
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType, 
              data: base64ImageData,
            },
          },
          {
            text: `User wants to apply the following edit to the provided image: "${editInstruction}". Generate a detailed image generation prompt for this modified image, ensuring all constraints are met.`
          }
        ],
      },
      config: {
        systemInstruction,
        responseMimeType: "text/plain", 
      }
    });

    const responseText = response.text;
    const promptPrefix = 'EDITED_PROMPT:';
    const promptIndex = responseText.indexOf(promptPrefix);

    if (promptIndex === -1) {
      throw new Error('AI response for edit prompt did not follow the expected format. Response: ' + responseText);
    }

    return responseText.substring(promptIndex + promptPrefix.length).trim();
  }

  async generateProfessionalImage(prompt: string, inputAspectRatio: string, outputMimeType: string): Promise<string> {
    const fullPrompt = `${prompt}, interior design, real estate photography, high resolution, 4k, professional lighting, photorealistic`;

    // Map common outputMimeTypes if Imagen 3.0 has stricter support
    let effectiveOutputMimeType = outputMimeType;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(outputMimeType)) {
        console.warn(`Unsupported outputMimeType '${outputMimeType}' for Imagen 3.0. Defaulting to 'image/png'.`);
        effectiveOutputMimeType = 'image/png';
    }


    const response = await this.ai.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: fullPrompt,
        config: {
          numberOfImages: 1,
          aspectRatio: inputAspectRatio, // Use the dynamically determined aspect ratio
          outputMimeType: effectiveOutputMimeType,
        },
    });

    if (response.generatedImages && response.generatedImages.length > 0) {
      return response.generatedImages[0].image.imageBytes;
    } else {
      throw new Error('Image generation failed or returned no images.');
    }
  }
}