import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { ModelPrice } from '../model-price.model';
import { ModelPriceService } from '../model-price.service';

@Component({
  selector: 'app-model-price-detail',
  imports: [DecimalPipe, ButtonModule, ToastModule],
  templateUrl: './model-price-detail.html',
  styles: `
    dl {
      display: grid;
      grid-template-columns: 10rem 1fr;
      gap: 0.75rem 1rem;
      margin: 0;
    }
    dt {
      font-weight: 600;
      color: #6b7280;
    }
    dd {
      margin: 0;
    }
  `,
})
export class ModelPriceDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(ModelPriceService);
  private readonly messages = inject(MessageService);

  readonly price = signal<ModelPrice | null>(null);

  ngOnInit() {
    const params = this.route.snapshot.paramMap;
    this.service.get(params.get('model')!, params.get('date')!).subscribe({
      next: (price) => this.price.set(price),
      error: () => this.messages.add({ severity: 'error', summary: '錯誤', detail: '載入模型價格失敗' }),
    });
  }

  edit() {
    const p = this.price()!;
    this.router.navigate(['/model-prices', p.model, p.effectiveDate, 'edit']);
  }

  back() {
    this.router.navigate(['/model-prices']);
  }
}
