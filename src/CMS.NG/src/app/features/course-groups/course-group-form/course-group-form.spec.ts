import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';
import { CourseGroup } from '../course-group.model';
import { CourseGroupService } from '../course-group.service';
import { CourseGroupForm } from './course-group-form';

const group: CourseGroup = { pkid: 2, description: '進階課程' };

describe('CourseGroupForm', () => {
  let service: jasmine.SpyObj<CourseGroupService>;
  let router: Router;

  async function setup(id: string | null): Promise<ComponentFixture<CourseGroupForm>> {
    service = jasmine.createSpyObj<CourseGroupService>('CourseGroupService', ['get', 'create', 'update']);
    service.get.and.returnValue(of(group));
    service.create.and.returnValue(of(group));
    service.update.and.returnValue(of(group));

    await TestBed.configureTestingModule({
      imports: [CourseGroupForm],
      providers: [
        { provide: CourseGroupService, useValue: service },
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(id ? { id } : {}) } } },
        provideNoopAnimations(),
        MessageService,
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
    const fixture = TestBed.createComponent(CourseGroupForm);
    fixture.detectChanges();
    return fixture;
  }

  describe('add', () => {
    let fixture: ComponentFixture<CourseGroupForm>;
    let component: CourseGroupForm;

    beforeEach(async () => {
      fixture = await setup(null);
      component = fixture.componentInstance;
    });

    it('starts empty, hides the pkid and does not load a record', () => {
      expect(component.isEdit).toBeFalse();
      expect(component.form.getRawValue()).toEqual({ description: '' });
      expect((fixture.nativeElement as HTMLElement).querySelector('#pkid')).toBeNull();
      expect(service.get).not.toHaveBeenCalled();
    });

    it('does not save an invalid form and flags the required field', () => {
      component.save();

      expect(service.create).not.toHaveBeenCalled();
      expect(component.invalid('description')).toBeTrue();
    });

    it('rejects a description longer than 100 characters', () => {
      component.form.patchValue({ description: 'x'.repeat(101) });

      component.save();

      expect(service.create).not.toHaveBeenCalled();
      expect(component.invalid('description')).toBeTrue();
    });

    it('creates the course group (trimmed, pkid 0) and returns to the list', () => {
      component.form.patchValue({ description: '  線上課程  ' });

      component.save();

      expect(service.create).toHaveBeenCalledWith({ pkid: 0, description: '線上課程' });
      expect(router.navigate).toHaveBeenCalledWith(['/course-groups']);
    });

    it('stays on the page when the save fails', () => {
      service.create.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      component.form.patchValue({ description: 'x' });

      component.save();

      expect(router.navigate).not.toHaveBeenCalled();
      expect(component.saving()).toBeFalse();
    });
  });

  describe('edit', () => {
    let fixture: ComponentFixture<CourseGroupForm>;
    let component: CourseGroupForm;

    beforeEach(async () => {
      fixture = await setup('2');
      component = fixture.componentInstance;
    });

    it('loads the course group and shows the pkid read-only', () => {
      expect(component.isEdit).toBeTrue();
      expect(service.get).toHaveBeenCalledWith(2);
      expect(component.form.getRawValue()).toEqual({ description: '進階課程' });
      const pkidInput = (fixture.nativeElement as HTMLElement).querySelector('#pkid') as HTMLInputElement;
      expect(pkidInput.value).toBe('2');
      expect(pkidInput.disabled).toBeTrue();
    });

    it('updates the course group with the route pkid and returns to the list', () => {
      component.form.patchValue({ description: '進階實務課程' });

      component.save();

      expect(service.update).toHaveBeenCalledWith({ pkid: 2, description: '進階實務課程' });
      expect(router.navigate).toHaveBeenCalledWith(['/course-groups']);
    });

    it('cancel() returns to the list without saving', () => {
      component.cancel();

      expect(service.update).not.toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/course-groups']);
    });
  });
});
