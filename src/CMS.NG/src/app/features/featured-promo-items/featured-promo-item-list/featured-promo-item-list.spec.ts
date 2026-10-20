import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { mondayOf, toIso } from '../../../core/utils/date.util';
import { FeaturedPromoItemForm } from '../featured-promo-item-form/featured-promo-item-form';
import { FeaturedPromoItem, PromotionLookup } from '../featured-promo-item.model';
import { FeaturedPromoItemService } from '../featured-promo-item.service';
import { FeaturedPromoItemList } from './featured-promo-item-list';
import { provideRowAuditStub } from '@app/core/testing/row-audit';
import { RowAuditService } from '@app/shared/row-audit/row-audit.service';

const skillTrain: PromotionLookup = { pkid: 10, promoCode: '20251204_SkillTrainAI', topic: 'T10', description: 'D10' };
const googleAi: PromotionLookup = { pkid: 11, promoCode: '251211_GoogleAI', topic: 'T11', description: 'D11' };

const items: FeaturedPromoItem[] = [
  {
    pkid: 1, scheduleOn: '2026-03-16', trainingCenterPkid: 1, slot: 1, promotionPkid: 10,
    topic: '成為能AI協作的程式設計師', description: '轉職就業養成班', promotion: skillTrain,
  },
  {
    pkid: 2, scheduleOn: '2026-03-16', trainingCenterPkid: 1, slot: 2, promotionPkid: 11,
    topic: 'Google AI工具一次掌握', description: '不需技術基礎', promotion: googleAi,
  },
  {
    pkid: 3, scheduleOn: '2026-03-22', trainingCenterPkid: 1, slot: 3, promotionPkid: 11,
    topic: '週日項目', description: '週日說明', promotion: googleAi,
  },
];

const centers = [
  { pkid: 1, name: '台北' },
  { pkid: 2, name: '新竹' },
];

describe('FeaturedPromoItemList', () => {
  let fixture: ComponentFixture<FeaturedPromoItemList>;
  let component: FeaturedPromoItemList;
  let service: jasmine.SpyObj<FeaturedPromoItemService>;
  let confirmation: ConfirmationService;
  let messages: MessageService;
  let el: HTMLElement;

  async function setup() {
    service = jasmine.createSpyObj<FeaturedPromoItemService>('FeaturedPromoItemService', [
      'getTrainingCenterLookups', 'query', 'delete', 'moveUp', 'moveDown', 'create', 'update', 'searchPromotions',
    ]);
    service.getTrainingCenterLookups.and.returnValue(of(centers));
    service.query.and.returnValue(of(items));
    service.delete.and.returnValue(of(undefined));
    service.moveUp.and.returnValue(of(undefined));
    service.moveDown.and.returnValue(of(undefined));
    service.searchPromotions.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [FeaturedPromoItemList],
      providers: [
        provideRowAuditStub(),
        { provide: FeaturedPromoItemService, useValue: service },
        provideNoopAnimations(),
        ConfirmationService,
        MessageService,
      ],
    }).compileComponents();

    confirmation = TestBed.inject(ConfirmationService);
    messages = TestBed.inject(MessageService);
    fixture = TestBed.createComponent(FeaturedPromoItemList);
    component = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  const row = (iso: string, slot: number) =>
    el.querySelector(`[data-day="${iso}"] [data-slot="${slot}"]`) as HTMLElement;
  const button = (iso: string, slot: number, cls: string) =>
    row(iso, slot).querySelector(`p-button.${cls} button`) as HTMLButtonElement | null;

  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());

  describe('defaults', () => {
    beforeEach(async () => await setup());

    it('opens the first training center tab on the current Monday–Sunday week', () => {
      const monday = toIso(mondayOf(new Date()));
      expect(component.trainingCenterPkid()).toBe(1);
      expect(service.query).toHaveBeenCalledWith({ trainingCenterPkid: 1, weekOf: monday });
      expect(JSON.parse(sessionStorage.getItem('featuredpromoitem-list-filters')!)).toEqual({
        trainingCenterPkid: 1, weekOf: monday,
      });
    });

    it('renders one tab per training center', () => {
      const tabs = Array.from(el.querySelectorAll('p-tab')).map((t) => t.textContent?.trim());
      expect(tabs).toEqual(['台北', '新竹']);
    });
  });

  describe('week of 2026-03-16', () => {
    beforeEach(async () => {
      sessionStorage.setItem(
        'featuredpromoitem-list-filters',
        JSON.stringify({ trainingCenterPkid: 1, weekOf: '2026-03-18' }),
      );
      await setup();
    });

    it('restores the saved tab and week, normalised to Monday', () => {
      expect(service.query).toHaveBeenCalledWith({ trainingCenterPkid: 1, weekOf: '2026-03-16' });
      expect(el.querySelector('#week-label')!.textContent).toContain('3/16 -- 3/22');
    });

    it('shows Monday to Sunday with three slots each', () => {
      const labels = Array.from(el.querySelectorAll('.day-header')).map((h) => h.textContent?.trim());
      expect(labels).toEqual([
        '3/16 (一)', '3/17 (二)', '3/18 (三)', '3/19 (四)', '3/20 (五)', '3/21 (六)', '3/22 (日)',
      ]);
      expect(el.querySelectorAll('.slot-row').length).toBe(21);
    });

    it('places each item in its day and slot with PromoCode, Topic and Description', () => {
      expect(row('2026-03-16', 1).querySelector('.promo-code')!.textContent).toContain('20251204_SkillTrainAI');
      expect(row('2026-03-16', 1).querySelector('.topic')!.textContent).toContain('成為能AI協作的程式設計師');
      expect(row('2026-03-16', 2).querySelector('.description')!.textContent).toContain('不需技術基礎');
      expect(row('2026-03-22', 3).querySelector('.promo-code')!.textContent).toContain('251211_GoogleAI');
      expect(row('2026-03-17', 1).querySelector('.promo-code')!.textContent!.trim()).toBe('');
    });

    it('shows Edit/Copy/Delete on filled slots and Edit/Paste on empty ones', () => {
      expect(button('2026-03-16', 1, 'copy')).not.toBeNull();
      expect(button('2026-03-16', 1, 'delete')).not.toBeNull();
      expect(button('2026-03-16', 1, 'paste')).toBeNull();
      expect(button('2026-03-17', 1, 'edit')).not.toBeNull();
      expect(button('2026-03-17', 1, 'paste')!.disabled).toBeTrue(); // nothing copied yet
      expect(button('2026-03-17', 1, 'copy')).toBeNull();
    });

    it('enables + / − only where the slot can move', () => {
      expect(button('2026-03-16', 1, 'move-up')!.disabled).toBeTrue();
      expect(button('2026-03-16', 1, 'move-down')!.disabled).toBeFalse();
      expect(button('2026-03-16', 2, 'move-up')!.disabled).toBeFalse();
      expect(button('2026-03-22', 3, 'move-down')!.disabled).toBeTrue();
      expect(button('2026-03-17', 2, 'move-down')!.disabled).toBeTrue(); // empty
    });

    it('selecting another tab filters by that training center and remembers it', () => {
      component.selectCenter(2);

      expect(service.query).toHaveBeenCalledWith({ trainingCenterPkid: 2, weekOf: '2026-03-16' });
      expect(JSON.parse(sessionStorage.getItem('featuredpromoitem-list-filters')!).trainingCenterPkid).toBe(2);
    });

    it('re-selecting the active tab does not refetch', () => {
      service.query.calls.reset();

      component.selectCenter(1);

      expect(service.query).not.toHaveBeenCalled();
    });

    it('moves a week forward / back and back to this week', () => {
      component.shiftWeek(1);
      expect(service.query).toHaveBeenCalledWith({ trainingCenterPkid: 1, weekOf: '2026-03-23' });

      component.shiftWeek(-2);
      expect(service.query).toHaveBeenCalledWith({ trainingCenterPkid: 1, weekOf: '2026-03-09' });

      component.thisWeek();
      expect(service.query.calls.mostRecent().args[0].weekOf).toBe(toIso(mondayOf(new Date())));
    });

    it('+ moves the slot down and − moves it up, then reloads', () => {
      service.query.calls.reset();

      button('2026-03-16', 1, 'move-down')!.click();
      button('2026-03-16', 2, 'move-up')!.click();

      expect(service.moveDown).toHaveBeenCalledWith(1);
      expect(service.moveUp).toHaveBeenCalledWith(2);
      expect(service.query).toHaveBeenCalledTimes(2);
    });

    it('reports a failed move', () => {
      service.moveDown.and.returnValue(throwError(() => new HttpErrorResponse({ status: 400 })));
      const add = spyOn(messages, 'add');

      component.moveDown(items[0]);

      expect(add).toHaveBeenCalledWith(jasmine.objectContaining({ severity: 'error' }));
    });

    it('Edit replaces the row with the form showing the existing values', () => {
      button('2026-03-16', 2, 'edit')!.click();
      fixture.detectChanges();

      expect(el.querySelectorAll('app-featured-promo-item-form').length).toBe(1);
      const form = fixture.debugElement
        .query((d) => d.componentInstance instanceof FeaturedPromoItemForm)
        .componentInstance as FeaturedPromoItemForm;
      expect(form.isEdit).toBeTrue();
      expect(form.form.getRawValue()).toEqual({
        promotion: googleAi, topic: 'Google AI工具一次掌握', description: '不需技術基礎',
      });
      expect(row('2026-03-16', 2).classList).toContain('editing');
    });

    it('Edit on an empty slot opens an empty New form for that day and slot', () => {
      button('2026-03-19', 3, 'edit')!.click();
      fixture.detectChanges();

      const form = fixture.debugElement
        .query((d) => d.componentInstance instanceof FeaturedPromoItemForm)
        .componentInstance as FeaturedPromoItemForm;
      expect(form.isEdit).toBeFalse();
      expect(form.scheduleOn()).toBe('2026-03-19');
      expect(form.slot()).toBe(3);
      expect(form.trainingCenterPkid()).toBe(1);
      expect(form.form.getRawValue()).toEqual({ promotion: null, topic: '', description: '' });
    });

    it('Copy then Paste opens a New form pre-filled with the copied values', () => {
      button('2026-03-16', 1, 'copy')!.click();
      fixture.detectChanges();
      expect(component.clip()).toEqual({
        promotion: skillTrain, topic: '成為能AI協作的程式設計師', description: '轉職就業養成班',
      });
      expect(button('2026-03-20', 2, 'paste')!.disabled).toBeFalse();

      button('2026-03-20', 2, 'paste')!.click();
      fixture.detectChanges();

      const form = fixture.debugElement
        .query((d) => d.componentInstance instanceof FeaturedPromoItemForm)
        .componentInstance as FeaturedPromoItemForm;
      expect(form.isEdit).toBeFalse();
      expect(form.scheduleOn()).toBe('2026-03-20');
      expect(form.slot()).toBe(2);
      expect(form.form.getRawValue()).toEqual({
        promotion: skillTrain, topic: '成為能AI協作的程式設計師', description: '轉職就業養成班',
      });
    });

    it('closes the form and reloads after a save; cancel just closes it', () => {
      component.edit(component.days()[0], component.days()[0].slots[0]);
      service.query.calls.reset();

      component.onSaved(items[0]);
      expect(component.editing()).toBeNull();
      expect(service.query).toHaveBeenCalledTimes(1);

      component.edit(component.days()[0], component.days()[0].slots[0]);
      component.onCancelled();
      expect(component.editing()).toBeNull();
      expect(service.query).toHaveBeenCalledTimes(1);
    });

    it('switching week closes an open form', () => {
      component.edit(component.days()[0], component.days()[0].slots[0]);

      component.shiftWeek(1);

      expect(component.editing()).toBeNull();
    });

    it('Delete asks for confirmation with the date, slot and PromoCode', () => {
      const confirm = spyOn(confirmation, 'confirm');

      component.remove(items[1]);

      const options = confirm.calls.mostRecent().args[0];
      expect(options.message).toContain('2026-03-16');
      expect(options.message).toContain('第 2 則');
      expect(options.message).toContain('251211_GoogleAI');
    });

    it('Delete removes the selected record after confirmation and reloads', () => {
      spyOn(confirmation, 'confirm').and.callFake((c) => {
        c.accept?.();
        return confirmation;
      });
      service.query.calls.reset();

      button('2026-03-16', 2, 'delete')!.click();

      expect(service.delete).toHaveBeenCalledWith(2);
      expect(service.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('異動紀錄 History badge', () => {
    let audit: jasmine.SpyObj<RowAuditService>;

    beforeEach(async () => {
      sessionStorage.setItem(
        'featuredpromoitem-list-filters',
        JSON.stringify({ trainingCenterPkid: 1, weekOf: '2026-03-16' }),
      );
      await setup();
      audit = TestBed.inject(RowAuditService) as jasmine.SpyObj<RowAuditService>;
      await fixture.whenStable();
    });

    const lastQuery = () => audit.queryHistory.calls.mostRecent().args;

    it('shows exactly one badge, in the page header, covering every item of the tab + week', () => {
      expect(el.querySelectorAll('app-row-audit-badge').length).toBe(1);
      expect(el.querySelector('.page-header app-row-audit-badge #row-audit-button')).not.toBeNull();
      expect(lastQuery()).toEqual(['FeaturedPromoItem', [1, 2, 3]]);
      expect(component.auditLabels()['2']).toBe('2026-03-16 #2 Google AI工具一次掌握');
    });

    it('stays the only badge while a slot is being edited', () => {
      button('2026-03-16', 1, 'edit')!.click();
      fixture.detectChanges();

      expect(el.querySelector('.editing app-row-audit-badge')).toBeNull();
      expect(el.querySelectorAll('app-row-audit-badge').length).toBe(1);
    });

    it('keeps a deleted item in the history until the week changes', async () => {
      spyOn(confirmation, 'confirm').and.callFake((c) => {
        c.accept?.();
        return confirmation;
      });
      service.query.and.returnValue(of(items.filter((i) => i.pkid !== 2)));

      button('2026-03-16', 2, 'delete')!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(lastQuery()).toEqual(['FeaturedPromoItem', [1, 3, 2]]);

      service.query.and.returnValue(of([]));
      component.shiftWeek(1);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      // An empty week sends no history request and shows the no-history state.
      expect(component.auditPkids()).toEqual([]);
      expect(el.querySelector('#row-audit-latest')!.textContent).toContain('尚無紀錄 No history');
    });
  });

  it('falls back to the first tab when the saved training center no longer exists', async () => {
    sessionStorage.setItem('featuredpromoitem-list-filters', JSON.stringify({ trainingCenterPkid: 99, weekOf: null }));
    await setup();

    expect(component.trainingCenterPkid()).toBe(1);
  });
});
