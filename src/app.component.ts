
import { Component, ChangeDetectionStrategy, signal, inject, ChangeDetectorRef } from '@angular/core';
import { DomSanitizer, SafeHtml, SafeUrl } from '@angular/platform-browser';
import { GeminiService } from './services/gemini.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private readonly geminiService = inject(GeminiService);
  private readonly sanitizer = inject(DomSanitizer);
  private cdr = inject(ChangeDetectorRef);

  uploadedImage = signal<string | null>(null);
  generatedImage = signal<SafeUrl | null>(null);
  analysis = signal<SafeHtml | null>(null);
  isLoading = signal<boolean>(false);
  loadingMessage = signal<string>('Analiziram Vašu fotografiju...');
  errorMessage = signal<string | null>(null);

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    // Add visual feedback
    const target = event.currentTarget as HTMLElement;
    target.classList.add('border-indigo-500', 'bg-indigo-50');
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    // Remove visual feedback
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
      this.handleFile(files[0]);
    }
  }

  onFileSelected(event: Event): void {
    const element = event.currentTarget as HTMLInputElement;
    const fileList: FileList | null = element.files;
    if (fileList && fileList.length > 0) {
      this.handleFile(fileList[0]);
    }
  }

  private handleFile(file: File): void {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        this.uploadedImage.set(e.target?.result as string);
        this.resetResults();
        this.cdr.detectChanges();
      };
      reader.readAsDataURL(file);
    } else {
      this.errorMessage.set('Molimo učitajte važeću slikovnu datoteku (PNG, JPG, WebP).');
    }
  }

  async enhanceImage(): Promise<void> {
    const imageDataUrl = this.uploadedImage();
    if (!imageDataUrl) return;

    this.isLoading.set(true);
    this.resetResults();
    
    try {
      this.loadingMessage.set('Analiziram osvjetljenje i kompoziciju...');
      this.cdr.detectChanges();
      const base64Data = imageDataUrl.split(',')[1];
      const analysisResult = await this.geminiService.analyzeImage(base64Data);
      
      this.analysis.set(this.sanitizer.bypassSecurityTrustHtml(analysisResult.suggestions));
      
      this.loadingMessage.set('Stvaram novu verziju Vaše fotografije s profesionalnim dodirom...');
      this.cdr.detectChanges();
      const imageBytes = await this.geminiService.generateProfessionalImage(analysisResult.prompt);
      const imageUrl = `data:image/png;base64,${imageBytes}`;
      this.generatedImage.set(this.sanitizer.bypassSecurityTrustUrl(imageUrl));

    } catch (error) {
      console.error('Error enhancing image:', error);
      this.errorMessage.set('Nije uspjelo poboljšanje slike. AI je možda preopterećen. Molimo pokušajte ponovno.');
    } finally {
      this.isLoading.set(false);
      this.cdr.detectChanges();
    }
  }
  
  reset(): void {
    this.uploadedImage.set(null);
    this.resetResults();
  }

  private resetResults(): void {
    this.generatedImage.set(null);
    this.analysis.set(null);
    this.errorMessage.set(null);
  }
}