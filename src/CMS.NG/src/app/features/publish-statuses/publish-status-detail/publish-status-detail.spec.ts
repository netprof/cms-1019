import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { MessageService } from 'primeng/api';
import { PublishStatusService } from '../publish-status.service';
import { PublishStatusDetail } from './publish-status-detail';

describe('PublishStatusDetail', () => {
  let service: jasmine.SpyObj<PublishStatusService>;

  beforeEach(async () => {
    service = jasmine.createSpyObj<PublishStatusService>('PublishStatusService', ['get']);
    service.get.and.returnValue(
      of({ pkid: 2, description: '已發布', isDraft: false, isPublished: true, isDiscontinued: false }),
    );

    await TestBed.configureTestingModule({
      imports: [PublishStatusDetail],
      providers: [
        { provide: PublishStatusService, useValue: service },
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '2' }) } } },
        provideNoopAnimations(),
        MessageService,
      ],
    }).compileComponents();
  });

  it('loads the status by numeric route id and renders its fields', () => {
    const fixture = TestBed.createComponent(PublishStatusDetail);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent!;

    expect(service.get).toHaveBeenCalledWith(2);
    expect(text).toContain('已發布');
    expect(text).toContain('主代碼');
  });

  it('renders the bool flags as 是 / 否 tags', () => {
    const fixture = TestBed.createComponent(PublishStatusDetail);
    fixture.detectChanges();
    const tags = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('p-tag')).map(
      (t) => t.textContent?.trim(),
    );

    expect(tags).toEqual(['否', '是', '否']);
  });

  it('navigates to edit and back', () => {
    const fixture = TestBed.createComponent(PublishStatusDetail);
    fixture.detectChanges();
    const navigate = spyOn(TestBed.inject(Router), 'navigate');

    fixture.componentInstance.edit();
    fixture.componentInstance.back();

    expect(navigate.calls.allArgs()).toEqual([[['/publish-statuses', 2, 'edit']], [['/publish-statuses']]]);
  });
});
