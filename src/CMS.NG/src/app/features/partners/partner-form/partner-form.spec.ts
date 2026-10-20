import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';
import { Partner } from '../partner.model';
import { PartnerService } from '../partner.service';
import { expectStickyToolbar } from '../../../core/testing/sticky-toolbar';
import { PartnerForm } from './partner-form';
import { expectNoRowAuditBadge, expectRowAuditBadge, provideRowAuditStub } from '@app/core/testing/row-audit';

const partner: Partner = {
  pkid: 2, name: 'Cisco', appKey: 'csco', nameOnPartnerMenu: 'Cisco 思科',
  nameOnCourseDetailPage: 'Cisco', displayOrder: 1, imageFilename: 'cisco.png',
};

describe('PartnerForm', () => {
  let service: jasmine.SpyObj<PartnerService>;
  let router: Router;

  async function setup(id: string | null): Promise<ComponentFixture<PartnerForm>> {
    service = jasmine.createSpyObj<PartnerService>('PartnerService', ['get', 'create', 'update']);
    service.get.and.returnValue(of(partner));
    service.create.and.returnValue(of(partner));
    service.update.and.returnValue(of(partner));

    await TestBed.configureTestingModule({
      imports: [PartnerForm],
      providers: [
        provideRowAuditStub(),
        { provide: PartnerService, useValue: service },
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(id ? { id } : {}) } } },
        provideNoopAnimations(),
        MessageService,
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
    const fixture = TestBed.createComponent(PartnerForm);
    fixture.detectChanges();
    return fixture;
  }

  it('pins the Save/Cancel toolbar to the top of the page when adding', async () => {
    expectStickyToolbar((await setup(null)).nativeElement);
  });

  it('pins the Save/Cancel toolbar to the top of the page when editing', async () => {
    expectStickyToolbar((await setup('2')).nativeElement);
  });

  describe('add', () => {
    let fixture: ComponentFixture<PartnerForm>;
    let component: PartnerForm;

    beforeEach(async () => {
      fixture = await setup(null);
      component = fixture.componentInstance;
    });

    it('starts empty with displayOrder 0, hides the pkid and does not load a record', () => {
      expect(component.isEdit).toBeFalse();
      expect(component.form.getRawValue()).toEqual({
        name: '', appKey: '', nameOnPartnerMenu: '', nameOnCourseDetailPage: '', displayOrder: 0, imageFilename: '',
      });
      expect((fixture.nativeElement as HTMLElement).querySelector('#pkid')).toBeNull();
      expect(service.get).not.toHaveBeenCalled();
    });

    it('does not save an invalid form and flags every required field', () => {
      component.save();

      expect(service.create).not.toHaveBeenCalled();
      expect(component.invalid('name')).toBeTrue();
      expect(component.invalid('appKey')).toBeTrue();
      expect(component.invalid('nameOnPartnerMenu')).toBeTrue();
      expect(component.invalid('nameOnCourseDetailPage')).toBeTrue();
      expect(component.invalid('imageFilename')).toBeFalse();
    });

    it('rejects an appKey longer than 10 characters', () => {
      component.form.patchValue({
        name: 'x', appKey: 'x'.repeat(11), nameOnPartnerMenu: 'x', nameOnCourseDetailPage: 'x',
      });

      component.save();

      expect(service.create).not.toHaveBeenCalled();
      expect(component.invalid('appKey')).toBeTrue();
    });

    it('creates the partner (trimmed, blank image as null, pkid 0) and returns to the list', () => {
      component.form.patchValue({
        name: ' VMware ', appKey: ' vmw ', nameOnPartnerMenu: 'VMware 虛擬化',
        nameOnCourseDetailPage: 'VMware', displayOrder: 9, imageFilename: '   ',
      });

      component.save();

      expect(service.create).toHaveBeenCalledWith({
        pkid: 0, name: 'VMware', appKey: 'vmw', nameOnPartnerMenu: 'VMware 虛擬化',
        nameOnCourseDetailPage: 'VMware', displayOrder: 9, imageFilename: null,
      });
      expect(router.navigate).toHaveBeenCalledWith(['/partners']);
    });

    it('stays on the page when the save fails', () => {
      service.create.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      component.form.patchValue({
        name: 'x', appKey: 'x', nameOnPartnerMenu: 'x', nameOnCourseDetailPage: 'x',
      });

      component.save();

      expect(router.navigate).not.toHaveBeenCalled();
      expect(component.saving()).toBeFalse();
    });
  });

  describe('edit', () => {
    let fixture: ComponentFixture<PartnerForm>;
    let component: PartnerForm;

    beforeEach(async () => {
      fixture = await setup('2');
      component = fixture.componentInstance;
    });

    it('loads the partner and shows the pkid read-only', () => {
      expect(component.isEdit).toBeTrue();
      expect(service.get).toHaveBeenCalledWith(2);
      expect(component.form.getRawValue()).toEqual({
        name: 'Cisco', appKey: 'csco', nameOnPartnerMenu: 'Cisco 思科',
        nameOnCourseDetailPage: 'Cisco', displayOrder: 1, imageFilename: 'cisco.png',
      });
      const pkidInput = (fixture.nativeElement as HTMLElement).querySelector('#pkid') as HTMLInputElement;
      expect(pkidInput.value).toBe('2');
      expect(pkidInput.disabled).toBeTrue();
    });

    it('updates the partner with the route pkid and returns to the list', () => {
      component.form.patchValue({ name: 'Cisco Systems', displayOrder: 5, imageFilename: '' });

      component.save();

      expect(service.update).toHaveBeenCalledWith({
        pkid: 2, name: 'Cisco Systems', appKey: 'csco', nameOnPartnerMenu: 'Cisco 思科',
        nameOnCourseDetailPage: 'Cisco', displayOrder: 5, imageFilename: null,
      });
      expect(router.navigate).toHaveBeenCalledWith(['/partners']);
    });

    it('cancel() returns to the list without saving', () => {
      component.cancel();

      expect(service.update).not.toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/partners']);
    });
  });

  describe('異動紀錄 History badge', () => {
    it('is hidden when adding', async () => {
      await expectNoRowAuditBadge(await setup(null));
    });

    it('shows the history of the edited record', async () => {
      await expectRowAuditBadge(await setup('2'), 'Partner', 2);
    });
  });
});
