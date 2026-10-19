import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should show the AppRole entry under 系統管理 Admin', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.nav-group')?.textContent).toContain('系統管理 Admin');
    const link = el.querySelector('a.nav-item') as HTMLAnchorElement;
    expect(link.textContent).toContain('角色 AppRole');
    expect(link.getAttribute('href')).toBe('/app-roles');
  });

  it('should show the PublishStatus entry under 系統管理 Admin', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a.nav-item'));
    const link = links.find((a) => a.textContent?.includes('發布狀態 PublishStatus')) as HTMLAnchorElement;

    expect(link).toBeDefined();
    expect(link.getAttribute('href')).toBe('/publish-statuses');
  });

  it('should show the Partner entry under a 課程管理 Course group', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const groups = Array.from(el.querySelectorAll('.nav-group')).map((g) => g.textContent?.trim());
    const links = Array.from(el.querySelectorAll('a.nav-item'));
    const link = links.find((a) => a.textContent?.includes('合作廠商 Partner')) as HTMLAnchorElement;

    expect(groups.some((g) => g?.includes('課程管理 Course'))).toBeTrue();
    expect(link).toBeDefined();
    expect(link.getAttribute('href')).toBe('/partners');
  });

  it('should show the CourseGroup entry under 課程管理 Course', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a.nav-item'));
    const link = links.find((a) => a.textContent?.includes('課程群組 CourseGroup')) as HTMLAnchorElement;

    expect(link).toBeDefined();
    expect(link.getAttribute('href')).toBe('/course-groups');
  });

  it('should show the Course entry under 課程管理 Course', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a.nav-item'));
    const link = links.find((a) => a.textContent?.includes('課程 Course')) as HTMLAnchorElement;

    expect(link).toBeDefined();
    expect(link.getAttribute('href')).toBe('/courses');
  });

  it('should collapse and expand a nav group', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    const adminLinks = () =>
      Array.from(el.querySelectorAll('a.nav-item')).filter((a) => a.textContent?.includes('角色 AppRole'));

    (el.querySelector('.nav-group') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(adminLinks().length).toBe(0);
    // Other groups stay open.
    expect(el.querySelector('a.nav-item')).not.toBeNull();

    (el.querySelector('.nav-group') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(adminLinks().length).toBe(1);
  });
});
