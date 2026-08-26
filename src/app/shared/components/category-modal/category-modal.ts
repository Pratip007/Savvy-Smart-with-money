import { Component, signal, output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-category-modal',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div id="cat-modal" class="modal-overlay" [style.display]="visible() ? 'flex' : 'none'" (click)="onBackdrop($event)">
      <div class="modal-sheet" role="dialog" aria-modal="true">
        <div class="modal-drag-handle"></div>
        <h3 class="modal-heading">New Category</h3>
        <input class="form-input" type="text" [(ngModel)]="name" placeholder="e.g. Subscriptions"
               maxlength="40" autocomplete="off" (keydown.enter)="confirm()">
        <div class="modal-actions">
          <button class="btn btn-ghost" (click)="cancel()">Cancel</button>
          <button class="btn btn-primary" (click)="confirm()">
            <i class="fa-solid fa-plus"></i> Add Category
          </button>
        </div>
      </div>
    </div>
  `
})
export class CategoryModalComponent {
  readonly visible = signal(false);
  name = '';
  confirmed = output<string>();

  open(): void { this.name = ''; this.visible.set(true); }
  cancel(): void { this.visible.set(false); }
  confirm(): void {
    const n = this.name.trim();
    if (!n) return;
    this.confirmed.emit(n);
    this.visible.set(false);
  }
  onBackdrop(e: MouseEvent): void { if (e.target === e.currentTarget) this.cancel(); }
}
