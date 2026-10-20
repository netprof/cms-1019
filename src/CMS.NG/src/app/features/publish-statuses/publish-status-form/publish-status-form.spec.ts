import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';
import { PublishStatus } from '../publish-status.model';
import { PublishStatusService } from '../publish-status.service';
import { expectStickyToolbar } from '../../../core/testing/sticky-toolbar';
import { PublishStatusForm } from './publish-status-form';

const status: PublishStatus = {
  pkid: 2, description: '已發布', isDraft: false, isPublished: true, isDiscontinued: false,
};

describe('PublishStatusForm', () => {
  let service: jasmine.SpyObj<PublishStatusService>;
  let router: Router;

  async function setup(id: string | null): Promise<ComponentFixture<PublishStatusForm>> {
    service = jasmine.createSpyObj<PublishStatusService>('PublishStatusService', ['get', 'create', 'update']);
    service.get.and.returnValue(of(status));
    service.create.and.returnValue(of(status));
    service.update.and.returnValue(of(status));

    await TestBed.configureTestingModule({
      imports: [PublishStatusForm],
      providers: [
        { provide: PublishStatusService, useValue: service },
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(id ? { id } : {}) } } },
        provideNoopAnimations(),
        MessageService,
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
    const fixture = TestBed.createComponent(PublishStatusForm);
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
    let component: PublishStatusForm;

    beforeEach(async () => {
      component = (await setup(null)).componentInstance;
    });

    it('starts empty with all flags off and does not load a record', () => {
      expect(component.isEdit).toBeFalse();
      expect(component.form.getRawValue()).toEqual({
        pkid: null, description: '', isDraft: false, isPublished: false, isDiscontinued: false,
      });
      expect(component.form.controls.pkid.enabled).toBeTrue();
      expect(service.get).not.toHaveBeenCalled();
    });

    it('does not save an invalid form', () => {
      component.save();

      expect(service.create).not.toHaveBeenCalled();
      expect(component.invalid('pkid')).toBeTrue();
      expect(component.invalid('description')).toBeTrue();
    });

    it('rejects a pkid outside the tinyint range', () => {
      component.form.patchValue({ pkid: 300, description: 'x' });

      component.save();

      expect(service.create).not.toHaveBeenCalled();
      expect(component.invalid('pkid')).toBeTrue();
    });

    it('rejects a description longer than 50 characters', () => {
      component.form.patchValue({ pkid: 9, description: 'x'.repeat(51) });

      component.save();

      expect(service.create).not.toHaveBeenCalled();
      expect(component.invalid('description')).toBeTrue();
    });

    it('creates the status (trimmed description) and returns to the list', () => {
      component.form.patchValue({ pkid: 9, description: ' 審核中 ', isDraft: true });

      component.save();

      expect(service.create).toHaveBeenCalledWith({
        pkid: 9, description: '審核中', isDraft: true, isPublished: false, isDiscontinued: false,
      });
      expect(router.navigate).toHaveBeenCalledWith(['/publish-statuses']);
    });

    it('stays on the page when the pkid already exists (409)', () => {
      service.create.and.returnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
      component.form.patchValue({ pkid: 1, description: 'x' });

      component.save();

      expect(router.navigate).not.toHaveBeenCalled();
      expect(component.saving()).toBeFalse();
    });
  });

  describe('edit', () => {
    let component: PublishStatusForm;

    beforeEach(async () => {
      component = (await setup('2')).componentInstance;
    });

    it('loads the status and locks the pkid', () => {
      expect(component.isEdit).toBeTrue();
      expect(service.get).toHaveBeenCalledWith(2);
      expect(component.form.controls.pkid.disabled).toBeTrue();
      expect(component.form.getRawValue()).toEqual({
        pkid: 2, description: '已發布', isDraft: false, isPublished: true, isDiscontinued: false,
      });
    });

    it('updates the status (key from the disabled control) and returns to the list', () => {
      component.form.patchValue({ description: '公開', isDiscontinued: true });

      component.save();

      expect(service.update).toHaveBeenCalledWith({
        pkid: 2, description: '公開', isDraft: false, isPublished: true, isDiscontinued: true,
      });
      expect(router.navigate).toHaveBeenCalledWith(['/publish-statuses']);
    });

    it('cancel() returns to the list without saving', () => {
      component.cancel();

      expect(service.update).not.toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/publish-statuses']);
    });
  });
});
