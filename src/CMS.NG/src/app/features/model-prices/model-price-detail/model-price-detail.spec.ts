import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ModelPriceService } from '../model-price.service';
import { ModelPriceDetail } from './model-price-detail';
import { expectRowAuditBadge, provideRowAuditStub } from '@app/core/testing/row-audit';

describe('ModelPriceDetail', () => {
  let service: jasmine.SpyObj<ModelPriceService>;

  beforeEach(async () => {
    service = jasmine.createSpyObj<ModelPriceService>('ModelPriceService', ['get']);
    service.get.and.returnValue(
      of({
        model: 'claude-haiku-5-5', effectiveDate: '2026-01-01',
        inputPrice: 0.1, cacheWrite5mPrice: 0.125, cacheWrite1hPrice: 0.2, cacheReadPrice: 0.01, outputPrice: 0.5,
      }),
    );

    await TestBed.configureTestingModule({
      imports: [ModelPriceDetail],
      providers: [
        provideRowAuditStub(),
        { provide: ModelPriceService, useValue: service },
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ model: 'claude-haiku-5-5', date: '2026-01-01' }) } },
        },
        provideNoopAnimations(),
        MessageService,
      ],
    }).compileComponents();
  });

  it('shows the 異動紀錄 History badge for this record', async () => {
    await expectRowAuditBadge(TestBed.createComponent(ModelPriceDetail), 'ModelPrice', 'claude-haiku-5-5,2026-01-01');
  });

  it('loads the price by the composite route key and renders all prices', () => {
    const fixture = TestBed.createComponent(ModelPriceDetail);
    fixture.detectChanges();
    const values = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('dd')).map((d) =>
      d.textContent?.trim(),
    );

    expect(service.get).toHaveBeenCalledWith('claude-haiku-5-5', '2026-01-01');
    expect(values).toEqual(['claude-haiku-5-5', '2026-01-01', '0.10', '0.125', '0.20', '0.01', '0.50']);
  });

  it('navigates to edit and back', () => {
    const fixture = TestBed.createComponent(ModelPriceDetail);
    fixture.detectChanges();
    const navigate = spyOn(TestBed.inject(Router), 'navigate');

    fixture.componentInstance.edit();
    fixture.componentInstance.back();

    expect(navigate.calls.allArgs()).toEqual([
      [['/model-prices', 'claude-haiku-5-5', '2026-01-01', 'edit']],
      [['/model-prices']],
    ]);
  });
});
