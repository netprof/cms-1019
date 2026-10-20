import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ModelPrice } from '../model-price.model';
import { ModelPriceService } from '../model-price.service';
import { expectStickyToolbar } from '../../../core/testing/sticky-toolbar';
import { ModelPriceForm } from './model-price-form';

const price: ModelPrice = {
  model: 'claude-opus-5-5', effectiveDate: '2026-01-01',
  inputPrice: 4, cacheWrite5mPrice: 5, cacheWrite1hPrice: 8, cacheReadPrice: 0.2, outputPrice: 20,
};

const prices = {
  inputPrice: 2, cacheWrite5mPrice: 2.5, cacheWrite1hPrice: 4, cacheReadPrice: 0.1, outputPrice: 10,
};

describe('ModelPriceForm', () => {
  let service: jasmine.SpyObj<ModelPriceService>;
  let router: Router;

  async function setup(key: { model: string; date: string } | null): Promise<ComponentFixture<ModelPriceForm>> {
    service = jasmine.createSpyObj<ModelPriceService>('ModelPriceService', ['get', 'create', 'update']);
    service.get.and.returnValue(of(price));
    service.create.and.returnValue(of(price));
    service.update.and.returnValue(of(price));

    await TestBed.configureTestingModule({
      imports: [ModelPriceForm],
      providers: [
        { provide: ModelPriceService, useValue: service },
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(key ?? {}) } } },
        provideNoopAnimations(),
        MessageService,
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
    const fixture = TestBed.createComponent(ModelPriceForm);
    fixture.detectChanges();
    return fixture;
  }

  it('pins the Save/Cancel toolbar to the top of the page when adding', async () => {
    expectStickyToolbar((await setup(null)).nativeElement);
  });

  it('pins the Save/Cancel toolbar to the top of the page when editing', async () => {
    expectStickyToolbar((await setup({ model: 'claude-opus-5-5', date: '2026-01-01' })).nativeElement);
  });

  describe('add', () => {
    let component: ModelPriceForm;

    beforeEach(async () => {
      component = (await setup(null)).componentInstance;
    });

    it('starts empty, with editable key fields, and does not load a record', () => {
      expect(component.isEdit).toBeFalse();
      expect(component.form.getRawValue()).toEqual({
        model: '', effectiveDate: null,
        inputPrice: null, cacheWrite5mPrice: null, cacheWrite1hPrice: null, cacheReadPrice: null, outputPrice: null,
      });
      expect(component.form.controls.model.enabled).toBeTrue();
      expect(component.form.controls.effectiveDate.enabled).toBeTrue();
      expect(service.get).not.toHaveBeenCalled();
    });

    it('does not save an empty form and flags every required field', () => {
      component.save();

      expect(service.create).not.toHaveBeenCalled();
      for (const name of ['model', 'effectiveDate', 'inputPrice', 'cacheWrite5mPrice', 'cacheWrite1hPrice', 'cacheReadPrice', 'outputPrice'] as const) {
        expect(component.invalid(name)).withContext(name).toBeTrue();
      }
    });

    it('rejects a negative price', () => {
      component.form.patchValue({ model: 'm', effectiveDate: new Date(2026, 0, 1), ...prices, cacheReadPrice: -0.01 });

      component.save();

      expect(service.create).not.toHaveBeenCalled();
      expect(component.invalid('cacheReadPrice')).toBeTrue();
    });

    it('rejects a model longer than 100 characters', () => {
      component.form.patchValue({ model: 'x'.repeat(101), effectiveDate: new Date(2026, 0, 1), ...prices });

      component.save();

      expect(service.create).not.toHaveBeenCalled();
      expect(component.invalid('model')).toBeTrue();
    });

    it('creates the price (trimmed model, ISO date, zero allowed) and returns to the list', () => {
      component.form.patchValue({
        model: ' claude-sonnet-5-5 ', effectiveDate: new Date(2026, 9, 20), ...prices, cacheReadPrice: 0,
      });

      component.save();

      expect(service.create).toHaveBeenCalledWith({
        model: 'claude-sonnet-5-5', effectiveDate: '2026-10-20', ...prices, cacheReadPrice: 0,
      });
      expect(router.navigate).toHaveBeenCalledWith(['/model-prices']);
    });

    it('stays on the page when the model and date already exist (409)', () => {
      service.create.and.returnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
      const add = spyOn(TestBed.inject(MessageService), 'add');
      component.form.patchValue({ model: 'claude-opus-5-5', effectiveDate: new Date(2026, 0, 1), ...prices });

      component.save();

      expect(router.navigate).not.toHaveBeenCalled();
      expect(component.saving()).toBeFalse();
      expect(add).toHaveBeenCalledWith(jasmine.objectContaining({ detail: jasmine.stringContaining('已存在') }));
    });
  });

  describe('edit', () => {
    let component: ModelPriceForm;

    beforeEach(async () => {
      component = (await setup({ model: 'claude-opus-5-5', date: '2026-01-01' })).componentInstance;
    });

    it('loads the price by its composite key and locks both key fields', () => {
      expect(component.isEdit).toBeTrue();
      expect(service.get).toHaveBeenCalledWith('claude-opus-5-5', '2026-01-01');
      expect(component.form.controls.model.disabled).toBeTrue();
      expect(component.form.controls.effectiveDate.disabled).toBeTrue();
      expect(component.form.getRawValue()).toEqual({
        model: 'claude-opus-5-5', effectiveDate: new Date(2026, 0, 1),
        inputPrice: 4, cacheWrite5mPrice: 5, cacheWrite1hPrice: 8, cacheReadPrice: 0.2, outputPrice: 20,
      });
    });

    it('updates the prices (key from the disabled controls) and returns to the list', () => {
      component.form.patchValue({ outputPrice: 18 });

      component.save();

      expect(service.update).toHaveBeenCalledWith({ ...price, outputPrice: 18 });
      expect(router.navigate).toHaveBeenCalledWith(['/model-prices']);
    });

    it('cancel() returns to the list without saving', () => {
      component.cancel();

      expect(service.update).not.toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/model-prices']);
    });
  });
});
