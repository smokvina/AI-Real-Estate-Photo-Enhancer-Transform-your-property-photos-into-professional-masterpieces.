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
    const systemInstruction = `Vi ste stručni AI asistent specijaliziran za analizu fotografija nekretnina. Vaš primarni cilj je pomoći korisnicima da poboljšaju svoje fotografije nekretnina generiranjem nove verzije koja izgleda profesionalno snimljena, zadržavajući pritom sadržaj i kompoziciju identičnom originalu.

      Analizirajte priloženu sliku i generirajte dvije stvari:
      1. Prijedlozi: Popis s 3-5 ključnih poboljšanja koja bi profesionalni fotograf napravio, s fokusom na aspekte poput osvjetljenja, ravnoteže boja i oštrine. Ovo je za informaciju korisnika. Koristite Markdown za formatiranje.
      2. Upit (Prompt): Vrlo detaljan, jednoparagrafski opisni upit za AI za generiranje slika. Ovaj upit MORA biti doslovan i precizan opis sadržaja, rasporeda, namještaja, tekstura, boja i točne perspektive kamere originalne slike. Nemojte dodavati, uklanjati ili mijenjati objekte u sceni. Cilj je opisati scenu s tako visokom vjernošću da generirana slika bude fotorealistična, profesionalno stilizirana verzija originala, a ne novo zamišljanje. Započnite ovaj dio s točnom frazom "PROMPT:".
      
      Primjer formata odgovora:
      *   **Poboljšajte osvjetljenje:** Slika bi bila bolja sa svjetlijim, prirodnijim svjetlom koje ravnomjerno osvjetljava cijeli prostor.
      *   **Pojačajte boje:** Malo povećajte zasićenost boja kako bi soba djelovala življe i privlačnije.
      *   **Povećajte oštrinu:** Izoštravanje slike istaknut će detalje na namještaju i teksturama.
      PROMPT: Fotografija dnevnog boravka snimljena ravno iz perspektive u razini očiju. U sredini je nizak, tamno smeđi drveni stolić za kavu s malom bijelom vazom na njemu. Iza stola je svijetlo siva platnena sofa s dva bijela jastuka s lijeve strane i jednim s desne. Velika, uokvirena apstraktna slika s plavim i zlatnim tonovima visi na bijelom zidu iznad sofe. Lijevo od sofe nalazi se visoka zelena biljka u crnoj keramičkoj posudi. Sunčeva svjetlost dolazi s velikog prozora koji je izvan okvira s desne strane, bacajući meko svjetlo na drveni pod.`;

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