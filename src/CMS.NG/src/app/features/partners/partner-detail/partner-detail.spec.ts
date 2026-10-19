import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { MessageService } from 'primeng/api';
import { Partner } from '../partner.model';
import { PartnerService } from '../partner.service';
import { PartnerDetail } from './partner-detail';

const partner: Partner = {
  pkid: 2, name: 'Cisco', appKey: 'csco', nameOnPartnerMenu: 'Cisco 思科',
  nameOnCourseDetailPage: 'Cisco', displayOrder: 1, imageFilename: null,
};

describe('PartnerDetail', () => {
  let service: jasmine.SpyObj<PartnerService>;

  beforeEach(async () => {
    service = jasmine.createSpyObj<PartnerService>('PartnerService', ['get']);
    service.get.and.returnValue(of(partner));

    await TestBed.configureTestingModule({
      imports: [PartnerDetail],
      providers: [
        { provide: PartnerService, useValue: service },
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '2' }) } } },
        provideNoopAnimations(),
        MessageService,
      ],
    }).compileComponents();
  });

  it('loads the partner by numeric route id and renders its fields', () => {
    const fixture = TestBed.createComponent(PartnerDetail);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent!;

    expect(service.get).toHaveBeenCalledWith(2);
    expect(text).toContain('Cisco 思科');
    expect(text).toContain('csco');
    expect(text).toContain('主代碼');
  });

  it('renders a dash when the image filename is null', () => {
    const fixture = TestBed.createComponent(PartnerDetail);
    fixture.detectChanges();
    const dd = (fixture.nativeElement as HTMLElement).querySelector('#image-filename');

    expect(dd?.textContent?.trim()).toBe('—');
  });

  it('renders the image filename when present', () => {
    service.get.and.returnValue(of({ ...partner, imageFilename: 'cisco.png' }));
    const fixture = TestBed.createComponent(PartnerDetail);
    fixture.detectChanges();
    const dd = (fixture.nativeElement as HTMLElement).querySelector('#image-filename');

    expect(dd?.textContent?.trim()).toBe('cisco.png');
  });

  it('navigates to edit and back', () => {
    const fixture = TestBed.createComponent(PartnerDetail);
    fixture.detectChanges();
    const navigate = spyOn(TestBed.inject(Router), 'navigate');

    fixture.componentInstance.edit();
    fixture.componentInstance.back();

    expect(navigate.calls.allArgs()).toEqual([[['/partners', 2, 'edit']], [['/partners']]]);
  });
});
