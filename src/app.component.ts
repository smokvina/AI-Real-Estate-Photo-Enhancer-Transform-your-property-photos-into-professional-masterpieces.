import { Component, ChangeDetectionStrategy, signal, inject, ChangeDetectorRef, Pipe, PipeTransform, computed } from '@angular/core';
import { DomSanitizer, SafeHtml, SafeUrl } from '@angular/platform-browser';
import { CommonModule } from '@angular/common'; // Import CommonModule
import { GeminiService } from './services/gemini.service';

interface ProcessedImage {
  id: string; // Unique ID for each image
  file: File; // The actual File object
  originalDataUrl: string; // Base64 data URL of the original upload
  generatedImageUrl: SafeUrl | null; // Sanitized URL for the generated image
  rawGeneratedImageBase64: string | null; // Raw base64 for re-editing
  analysis: SafeHtml | null; // AI analysis suggestions
  status: 'pending' | 'processing' | 'enhanced' | 'edited' | 'error';
  errorMessage: string | null;
  aspectRatio: string | null;
  mimeType: string | null;
  fileName: string; // Original file name
  isComparisonView: boolean; // For per-image comparison toggle
}

@Pipe({
  name: 'fileToDataUrl',
  standalone: true
})
export class FileToDataUrlPipe implements PipeTransform {
  transform(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  }
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  standalone: true,
  imports: [FileToDataUrlPipe, CommonModule], // Add CommonModule here
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private readonly geminiService = inject(GeminiService);
  private readonly sanitizer = inject(DomSanitizer);
  private cdr = inject(ChangeDetectorRef);

  uploadedFiles = signal<File[]>([]);
  processedImages = signal<ProcessedImage[]>([]);
  
  isGlobalLoading = signal<boolean>(false);
  globalLoadingMessage = signal<string>('Analiziram Vaše fotografije...');
  globalErrorMessage = signal<string | null>(null);
  editingPrompt = signal<string>('');

  // Computed signal to determine if batch editing section should be shown
  canEditBatch = computed(() => 
    this.processedImages().some(img => img.status === 'enhanced' || img.status === 'edited')
  );

  // Computed signal for the disabled state of the "Apply Edit" button
  isApplyEditButtonDisabled = computed(() => 
    this.isGlobalLoading() || !this.editingPrompt().trim() || !this.canEditBatch()
  );

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    target.classList.add('border-indigo-500', 'bg-indigo-50');
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    target.classList.remove('border-indigo-500', 'bg-indigo-50');
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    target.classList.remove('border-indigo-500', 'bg-indigo-50');
    
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFiles(Array.from(files));
    }
  }

  onFileSelected(event: Event): void {
    const element = event.currentTarget as HTMLInputElement;
    const fileList: FileList | null = element.files;
    if (fileList && fileList.length > 0) {
      this.handleFiles(Array.from(fileList));
    }
  }

  private handleFiles(files: File[]): void {
    const newValidFiles = files.filter(file => file.type.startsWith('image/') && !this.uploadedFiles().some(f => f.name === file.name));
    if (newValidFiles.length > 0) {
      this.uploadedFiles.update(currentFiles => [...currentFiles, ...newValidFiles]);
      this.globalErrorMessage.set(null); // Clear global error on new valid uploads
      this.cdr.detectChanges();
    } else if (files.length > 0) {
      this.globalErrorMessage.set('Nijedna od odabranih datoteka nije valjana slikovna datoteka ili su već učitane.');
    }
  }

  removeFile(fileName: string): void {
    this.uploadedFiles.update(currentFiles => currentFiles.filter(f => f.name !== fileName));
    this.cdr.detectChanges();
  }

  removeProcessedImage(id: string): void {
    this.processedImages.update(currentImages => currentImages.filter(img => img.id !== id));
    this.cdr.detectChanges();
  }

  async enhanceImages(): Promise<void> {
    const filesToProcess = this.uploadedFiles();
    if (filesToProcess.length === 0) {
      this.globalErrorMessage.set('Molimo učitajte barem jednu fotografiju za poboljšanje.');
      return;
    }

    this.isGlobalLoading.set(true);
    this.globalErrorMessage.set(null);
    this.globalLoadingMessage.set('Pripremam fotografije za AI obradu...');
    this.cdr.detectChanges();

    // Reset processedImages for a fresh batch
    this.processedImages.set([]);

    for (const file of filesToProcess) {
      const id = crypto.randomUUID();
      const newProcessedImage: ProcessedImage = {
        id,
        file,
        originalDataUrl: '', // Will be set after FileReader
        generatedImageUrl: null,
        rawGeneratedImageBase64: null,
        analysis: null,
        status: 'pending',
        errorMessage: null,
        aspectRatio: null,
        mimeType: null,
        fileName: file.name,
        isComparisonView: false,
      };
      this.processedImages.update(images => [...images, newProcessedImage]);
      this.cdr.detectChanges();

      try {
        const dataUrl: string = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e: ProgressEvent<FileReader>) => resolve(e.target?.result as string);
          reader.onerror = error => reject(error);
          reader.readAsDataURL(file);
        });

        this.processedImages.update(images => 
          images.map(img => img.id === id ? { ...img, originalDataUrl: dataUrl, status: 'processing' } : img)
        );
        this.globalLoadingMessage.set(`Analiziram ${file.name}...`);
        this.cdr.detectChanges();

        const analysisResult = await this.geminiService.analyzeImage(dataUrl);
        
        this.processedImages.update(images => 
          images.map(img => img.id === id ? { 
            ...img, 
            analysis: this.sanitizer.bypassSecurityTrustHtml(analysisResult.suggestions),
            aspectRatio: analysisResult.aspectRatio,
            mimeType: analysisResult.mimeType,
            status: 'processing' // Still processing, but analysis is done
          } : img)
        );
        this.globalLoadingMessage.set(`Generiram poboljšanu sliku za ${file.name}...`);
        this.cdr.detectChanges();

        const imageBytes = await this.geminiService.generateProfessionalImage(
          analysisResult.prompt,
          analysisResult.aspectRatio,
          analysisResult.mimeType
        );
        const imageUrl = `data:${analysisResult.mimeType};base64,${imageBytes}`;

        this.processedImages.update(images => 
          images.map(img => img.id === id ? { 
            ...img, 
            generatedImageUrl: this.sanitizer.bypassSecurityTrustUrl(imageUrl),
            rawGeneratedImageBase64: imageBytes,
            status: 'enhanced',
            errorMessage: null,
          } : img)
        );
      } catch (error: any) {
        console.error(`Error enhancing ${file.name}:`, error);
        this.processedImages.update(images => 
          images.map(img => img.id === id ? { 
            ...img, 
            status: 'error', 
            errorMessage: error.message || 'Nije uspjelo poboljšanje slike. Molimo pokušajte ponovno.' 
          } : img)
        );
        this.globalErrorMessage.set('Došlo je do pogreške prilikom obrade jedne ili više slika.');
      } finally {
        this.cdr.detectChanges();
      }
    }
    this.isGlobalLoading.set(false);
    this.globalLoadingMessage.set('AI obrada završena.');
    this.cdr.detectChanges();
  }

  onEditingPromptChange(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    this.editingPrompt.set(inputElement.value);
  }

  async applyImageEditToAll(): Promise<void> {
    const editPrompt = this.editingPrompt().trim();
    const imagesToEdit = this.processedImages().filter(img => 
      (img.status === 'enhanced' || img.status === 'edited') && img.rawGeneratedImageBase64
    );

    if (imagesToEdit.length === 0 || !editPrompt) {
      this.globalErrorMessage.set('Nema slika za uređivanje ili upit za uređivanje je prazan.');
      return;
    }

    this.isGlobalLoading.set(true);
    this.globalErrorMessage.set(null);
    this.globalLoadingMessage.set('Analiziram zahtjev za uređivanje...');
    this.cdr.detectChanges();

    for (const image of imagesToEdit) {
      this.processedImages.update(images => 
        images.map(img => img.id === image.id ? { ...img, status: 'processing', errorMessage: null } : img)
      );
      this.globalLoadingMessage.set(`Uređujem ${image.fileName}...`);
      this.cdr.detectChanges();

      try {
        if (!image.rawGeneratedImageBase64 || !image.mimeType || !image.aspectRatio) {
          throw new Error('Missing image data for editing.');
        }
        const dataUrlOfCurrentImage = `data:${image.mimeType};base64,${image.rawGeneratedImageBase64}`;
        const newImageGenPrompt = await this.geminiService.generateImageEditPrompt(dataUrlOfCurrentImage, editPrompt);

        this.globalLoadingMessage.set(`Generiram uređenu sliku za ${image.fileName}...`);
        this.cdr.detectChanges();
        
        const imageBytes = await this.geminiService.generateProfessionalImage(
          newImageGenPrompt,
          image.aspectRatio,
          image.mimeType
        );
        const imageUrl = `data:${image.mimeType};base64,${imageBytes}`;

        this.processedImages.update(images => 
          images.map(img => img.id === image.id ? { 
            ...img, 
            generatedImageUrl: this.sanitizer.bypassSecurityTrustUrl(imageUrl),
            rawGeneratedImageBase64: imageBytes,
            status: 'edited',
            errorMessage: null,
          } : img)
        );
      } catch (error: any) {
        console.error(`Error applying edit to ${image.fileName}:`, error);
        this.processedImages.update(images => 
          images.map(img => img.id === image.id ? { 
            ...img, 
            status: 'error', 
            errorMessage: error.message || 'Nije uspjelo uređivanje slike. Molimo pokušajte ponovno.' 
          } : img)
        );
        this.globalErrorMessage.set('Došlo je do pogreške prilikom uređivanja jedne ili više slika.');
      } finally {
        this.cdr.detectChanges();
      }
    }
    this.isGlobalLoading.set(false);
    this.globalLoadingMessage.set('Uređivanje završeno.');
    this.editingPrompt.set(''); // Clear the editing prompt after applying
    this.cdr.detectChanges();
  }
  
  toggleComparison(id: string): void {
    this.processedImages.update(images => 
      images.map(img => img.id === id ? { ...img, isComparisonView: !img.isComparisonView } : img)
    );
    this.cdr.detectChanges();
  }

  resetAll(): void {
    this.uploadedFiles.set([]);
    this.processedImages.set([]);
    this.isGlobalLoading.set(false);
    this.globalLoadingMessage.set('Analiziram Vaše fotografije...');
    this.globalErrorMessage.set(null);
    this.editingPrompt.set('');
    this.cdr.detectChanges();
  }
}