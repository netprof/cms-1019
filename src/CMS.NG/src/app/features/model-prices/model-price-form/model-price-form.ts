import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { parseIso, toIso } from '../../../core/utils/date.util';
import { ModelPriceRequest, modelPriceAuditKey } from '../model-price.model';
import { ModelPriceService } from '../model-price.service';
import { RowAuditBadge } from '@app/shared/row-audit/row-audit-badge';

type PriceField = 'inputPrice' | 'cacheWrite5mPrice' | 'cacheWrite1hPrice' | 'cacheReadPrice' | 'outputPrice';

@Component({
  selector: 'app-model-price-form',
  imports: [ReactiveFormsModule, ButtonModule, DatePickerModule, InputNumberModule, InputTextModule, ToastModule, RowAuditBadge],
  templateUrl: './model-price-form.html',
})
export class ModelPriceForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(ModelPriceService);
  private readonly messages = inject(MessageService);

  private readonly modelParam = this.route.snapshot.paramMap.get('model');
  private readonly dateParam = this.route.snapshot.paramMap.get('date');
  readonly isEdit = this.modelParam !== null && this.dateParam !== null;
  readonly auditKey = this.isEdit ? modelPriceAuditKey(this.modelParam!, this.dateParam!) : null;
  readonly saving = signal(false);
  readonly submitted = signal(false);

  /** Price inputs in display order; `name` is both the control name and the input id. */
  readonly priceFields: { name: PriceField; label: string }[] = [
    { name: 'inputPrice', label: '輸入' },
    { name: 'cacheWrite5mPrice', label: '快取寫入 5 分鐘' },
    { name: 'cacheWrite1hPrice', label: '快取寫入 1 小時' },
    { name: 'cacheReadPrice', label: '快取讀取' },
    { name: 'outputPrice', label: '輸出' },
  ];

  private readonly price = () => [null as number | null, [Validators.required, Validators.min(0)]];

  readonly form = this.fb.nonNullable.group({
    model: ['', [Validators.required, Validators.maxLength(100)]],
    effectiveDate: [null as Date | null, Validators.required],
    inputPrice: this.price(),
    cacheWrite5mPrice: this.price(),
    cacheWrite1hPrice: this.price(),
    cacheReadPrice: this.price(),
    outputPrice: this.price(),
  });

  ngOnInit() {
    if (!this.isEdit) return;

    this.form.controls.model.disable();
    this.form.controls.effectiveDate.disable();
    this.service.get(this.modelParam!, this.dateParam!).subscribe({
      next: (p) =>
        this.form.patchValue({
          model: p.model,
          effectiveDate: parseIso(p.effectiveDate),
          inputPrice: p.inputPrice,
          cacheWrite5mPrice: p.cacheWrite5mPrice,
          cacheWrite1hPrice: p.cacheWrite1hPrice,
          cacheReadPrice: p.cacheReadPrice,
          outputPrice: p.outputPrice,
        }),
      error: () => this.messages.add({ severity: 'error', summary: '錯誤', detail: '載入資料失敗' }),
    });
  }

  invalid(name: 'model' | 'effectiveDate' | PriceField): boolean {
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
    const request: ModelPriceRequest = {
      model: v.model.trim(),
      effectiveDate: toIso(v.effectiveDate)!,
      inputPrice: v.inputPrice!,
      cacheWrite5mPrice: v.cacheWrite5mPrice!,
      cacheWrite1hPrice: v.cacheWrite1hPrice!,
      cacheReadPrice: v.cacheReadPrice!,
      outputPrice: v.outputPrice!,
    };

    this.saving.set(true);
    const call = this.isEdit ? this.service.update(request) : this.service.create(request);
    call.subscribe({
      next: () => {
        this.saving.set(false);
        this.router.navigate(['/model-prices']);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const detail =
          err.status === 409
            ? `模型「${request.model}」於 ${request.effectiveDate} 的價格已存在`
            : '儲存失敗，請稍後再試';
        this.messages.add({ severity: 'error', summary: '錯誤', detail });
      },
    });
  }

  cancel() {
    this.router.navigate(['/model-prices']);
  }
}
