import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MessageService } from 'primeng/api';
import { AutoCompleteCompleteEvent, AutoCompleteModule, AutoCompleteSelectEvent } from 'primeng/autocomplete';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import {
  FeaturedPromoItem,
  FeaturedPromoItemClip,
  FeaturedPromoItemRequest,
  PromotionLookup,
} from '../featured-promo-item.model';
import { FeaturedPromoItemService } from '../featured-promo-item.service';

/** The autocomplete holds the typed text until a suggestion is picked; only a picked promotion is valid. */
function promotionSelected(control: AbstractControl): ValidationErrors | null {
  const v = control.value as PromotionLookup | string | null;
  return v && typeof v === 'object' && v.pkid > 0 ? null : { promotion: true };
}

/**
 * Inline Edit / New form shown in place of one slot row on the list page.
 * Edit mode when `item` is set; otherwise New, optionally pre-filled from a copied `preset`.
 */
@Component({
  selector: 'app-featured-promo-item-form',
  imports: [ReactiveFormsModule, AutoCompleteModule, ButtonModule, InputTextModule],
  templateUrl: './featured-promo-item-form.html',
  styles: `
    .inline-form {
      border: 2px solid var(--p-primary-color);
      border-radius: 8px;
      padding: 1rem 1.25rem 0.25rem;
      margin: 0.25rem 0 0.5rem;
      background: #fff;
    }
    .actions {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }
  `,
})
export class FeaturedPromoItemForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(FeaturedPromoItemService);
  private readonly messages = inject(MessageService);

  /** Existing record (Edit), or null (New). */
  readonly item = input<FeaturedPromoItem | null>(null);
  /** Values copied from another slot (New only). */
  readonly preset = input<FeaturedPromoItemClip | null>(null);
  /** ISO yyyy-MM-dd of the target day (New). */
  readonly scheduleOn = input.required<string>();
  readonly trainingCenterPkid = input.required<number>();
  readonly slot = input.required<number>();

  readonly saved = output<FeaturedPromoItem>();
  readonly cancelled = output<void>();

  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly suggestions = signal<PromotionLookup[]>([]);

  readonly form = this.fb.nonNullable.group({
    promotion: [null as PromotionLookup | string | null, [promotionSelected]],
    topic: ['', [Validators.required, Validators.maxLength(100)]],
    description: ['', [Validators.required, Validators.maxLength(300)]],
  });

  get isEdit(): boolean {
    return this.item() !== null;
  }

  ngOnInit() {
    const source = this.item() ?? this.preset();
    if (source) {
      this.form.patchValue({
        promotion: source.promotion,
        topic: source.topic,
        description: source.description,
      });
    }
  }

  searchPromotions(event: AutoCompleteCompleteEvent) {
    this.service.searchPromotions(event.query.trim()).subscribe({
      next: (list) => this.suggestions.set(list),
      error: () => this.suggestions.set([]),
    });
  }

  /** Picking a PromoCode sets Promotion_pkid and copies that promotion's Topic / Description. */
  onPromotionSelect(event: AutoCompleteSelectEvent) {
    const promotion = event.value as PromotionLookup;
    this.form.patchValue({ topic: promotion.topic, description: promotion.description });
  }

  invalid(name: keyof FeaturedPromoItemForm['form']['controls']): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.submitted());
  }

  save() {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();
    const existing = this.item();
    const request: FeaturedPromoItemRequest = {
      pkid: existing?.pkid ?? 0,
      scheduleOn: existing?.scheduleOn ?? this.scheduleOn(),
      trainingCenterPkid: existing?.trainingCenterPkid ?? this.trainingCenterPkid(),
      slot: existing?.slot ?? this.slot(),
      promotionPkid: (v.promotion as PromotionLookup).pkid,
      topic: v.topic.trim(),
      description: v.description.trim(),
    };

    this.saving.set(true);
    const call = existing ? this.service.update(request) : this.service.create(request);
    call.subscribe({
      next: (result) => {
        this.saving.set(false);
        this.saved.emit(result);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const detail = err.status === 409 ? '此時段已有上稿項目，請重新整理後再試' : '儲存失敗，請稍後再試';
        this.messages.add({ severity: 'error', summary: '錯誤', detail });
      },
    });
  }

  cancel() {
    this.cancelled.emit();
  }
}
