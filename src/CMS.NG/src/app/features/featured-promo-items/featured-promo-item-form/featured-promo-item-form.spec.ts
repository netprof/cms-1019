import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';
import { FeaturedPromoItem, FeaturedPromoItemClip, PromotionLookup } from '../featured-promo-item.model';
import { FeaturedPromoItemService } from '../featured-promo-item.service';
import { FeaturedPromoItemForm } from './featured-promo-item-form';

const skillTrain: PromotionLookup = {
  pkid: 10, promoCode: '20251204_SkillTrainAI', topic: '成為能AI協作的程式設計師', description: '轉職就業養成班',
};
const googleAi: PromotionLookup = {
  pkid: 11, promoCode: '251211_GoogleAI', topic: 'Google AI工具一次掌握', description: '不需技術基礎',
};

const item: FeaturedPromoItem = {
  pkid: 5, scheduleOn: '2026-03-16', trainingCenterPkid: 1, slot: 2, promotionPkid: 10,
  topic: '自訂標題', description: '自訂說明', promotion: skillTrain,
};

describe('FeaturedPromoItemForm', () => {
  let fixture: ComponentFixture<FeaturedPromoItemForm>;
  let component: FeaturedPromoItemForm;
  let service: jasmine.SpyObj<FeaturedPromoItemService>;
  let messages: MessageService;

  async function setup(inputs: { item?: FeaturedPromoItem | null; preset?: FeaturedPromoItemClip | null }) {
    service = jasmine.createSpyObj<FeaturedPromoItemService>('FeaturedPromoItemService', [
      'create', 'update', 'searchPromotions',
    ]);
    service.create.and.returnValue(of({ ...item, pkid: 99 }));
    service.update.and.returnValue(of(item));
    service.searchPromotions.and.returnValue(of([googleAi]));

    await TestBed.configureTestingModule({
      imports: [FeaturedPromoItemForm],
      providers: [
        { provide: FeaturedPromoItemService, useValue: service },
        provideNoopAnimations(),
        MessageService,
      ],
    }).compileComponents();

    messages = TestBed.inject(MessageService);
    fixture = TestBed.createComponent(FeaturedPromoItemForm);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('item', inputs.item ?? null);
    fixture.componentRef.setInput('preset', inputs.preset ?? null);
    fixture.componentRef.setInput('scheduleOn', '2026-03-18');
    fixture.componentRef.setInput('trainingCenterPkid', 3);
    fixture.componentRef.setInput('slot', 1);
    fixture.detectChanges();
  }

  describe('new', () => {
    beforeEach(async () => await setup({}));

    it('starts empty', () => {
      expect(component.isEdit).toBeFalse();
      expect(component.form.getRawValue()).toEqual({ promotion: null, topic: '', description: '' });
    });

    it('does not save an invalid form and flags every field', () => {
      component.save();

      expect(service.create).not.toHaveBeenCalled();
      expect(component.invalid('promotion')).toBeTrue();
      expect(component.invalid('topic')).toBeTrue();
      expect(component.invalid('description')).toBeTrue();
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).querySelectorAll('.error').length).toBe(3);
    });

    it('treats typed PromoCode text that was not picked from the list as invalid', () => {
      component.form.patchValue({ promotion: '251211', topic: 't', description: 'd' });

      component.save();

      expect(component.invalid('promotion')).toBeTrue();
      expect(service.create).not.toHaveBeenCalled();
    });

    it('searchPromotions() looks up the typed PromoCode and offers the matches', () => {
      component.searchPromotions({ originalEvent: new Event('input'), query: ' GoogleAI ' });

      expect(service.searchPromotions).toHaveBeenCalledWith('GoogleAI');
      expect(component.suggestions()).toEqual([googleAi]);
    });

    it('picking a promotion fills Topic and Description from Promotion2', () => {
      component.form.patchValue({ promotion: googleAi });
      component.onPromotionSelect({ originalEvent: new Event('click'), value: googleAi });

      expect(component.form.getRawValue()).toEqual({
        promotion: googleAi, topic: 'Google AI工具一次掌握', description: '不需技術基礎',
      });
    });

    it('creates the item on the target day/center/slot with the picked promotion pkid', () => {
      const saved = jasmine.createSpy('saved');
      component.saved.subscribe(saved);
      component.form.patchValue({ promotion: googleAi, topic: '  標題  ', description: ' 說明 ' });

      component.save();

      expect(service.create).toHaveBeenCalledWith({
        pkid: 0, scheduleOn: '2026-03-18', trainingCenterPkid: 3, slot: 1,
        promotionPkid: 11, topic: '標題', description: '說明',
      });
      expect(saved).toHaveBeenCalledWith(jasmine.objectContaining({ pkid: 99 }));
      expect(component.saving()).toBeFalse();
    });

    it('shows a slot-taken message on 409 and does not emit saved', () => {
      service.create.and.returnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
      const add = spyOn(messages, 'add');
      const saved = jasmine.createSpy('saved');
      component.saved.subscribe(saved);
      component.form.patchValue({ promotion: googleAi, topic: 't', description: 'd' });

      component.save();

      expect(saved).not.toHaveBeenCalled();
      expect(add).toHaveBeenCalledWith(
        jasmine.objectContaining({ severity: 'error', detail: jasmine.stringContaining('此時段已有上稿項目') }),
      );
      expect(component.saving()).toBeFalse();
    });

    it('cancel() emits cancelled without saving', () => {
      const cancelled = jasmine.createSpy('cancelled');
      component.cancelled.subscribe(cancelled);

      component.cancel();

      expect(cancelled).toHaveBeenCalled();
      expect(service.create).not.toHaveBeenCalled();
    });
  });

  describe('new from paste', () => {
    it('pre-fills the copied values', async () => {
      await setup({ preset: { promotion: googleAi, topic: '複製標題', description: '複製說明' } });

      expect(component.isEdit).toBeFalse();
      expect(component.form.getRawValue()).toEqual({
        promotion: googleAi, topic: '複製標題', description: '複製說明',
      });

      component.save();

      expect(service.create).toHaveBeenCalledWith(
        jasmine.objectContaining({ pkid: 0, scheduleOn: '2026-03-18', slot: 1, promotionPkid: 11, topic: '複製標題' }),
      );
    });
  });

  describe('edit', () => {
    beforeEach(async () => await setup({ item }));

    it('shows the existing values, with PromoCode looked up from the promotion', () => {
      expect(component.isEdit).toBeTrue();
      expect(component.form.getRawValue()).toEqual({ promotion: skillTrain, topic: '自訂標題', description: '自訂說明' });
      const input = (fixture.nativeElement as HTMLElement).querySelector('#promotion-1') as HTMLInputElement;
      expect(input.value).toBe('20251204_SkillTrainAI');
    });

    it('updates using the record key, day, center and slot (not the inputs)', () => {
      component.form.patchValue({ promotion: googleAi, topic: '新標題' });

      component.save();

      expect(service.update).toHaveBeenCalledWith({
        pkid: 5, scheduleOn: '2026-03-16', trainingCenterPkid: 1, slot: 2,
        promotionPkid: 11, topic: '新標題', description: '自訂說明',
      });
      expect(service.create).not.toHaveBeenCalled();
    });

    it('stays open with an error message when the update fails', () => {
      service.update.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      const add = spyOn(messages, 'add');
      const saved = jasmine.createSpy('saved');
      component.saved.subscribe(saved);

      component.save();

      expect(saved).not.toHaveBeenCalled();
      expect(add).toHaveBeenCalledWith(jasmine.objectContaining({ detail: '儲存失敗，請稍後再試' }));
    });
  });
});
