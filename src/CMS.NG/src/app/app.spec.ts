import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { App } from './app';
import { signIn } from './core/testing/auth';

describe('App', () => {
  beforeEach(async () => {
    // Signed in as an Admin unless a test says otherwise; AuthService reads storage when created.
    sessionStorage.clear();
    signIn(['Admin']);
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();
  });

  afterEach(() => sessionStorage.clear());

  const groupLabels = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('.nav-group')).map((g) => g.textContent?.trim());

  it('shows the 系統管理 Admin group when the roles include Admin', () => {
    sessionStorage.clear();
    signIn(['User', 'Admin']);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    expect(groupLabels(fixture.nativeElement)).toContain('系統管理 Admin');
  });

  it('hides the 系統管理 Admin group and its links for users without the Admin role', () => {
    sessionStorage.clear();
    signIn(['User']);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(groupLabels(el)).not.toContain('系統管理 Admin');
    expect(groupLabels(el)).toContain('課程管理 Course');
    expect(el.querySelector('a[href="/app-users"]')).toBeNull();
  });

  it('hides the 系統管理 Admin group for a role that differs only in case', () => {
    sessionStorage.clear();
    signIn(['admin']);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    expect(groupLabels(fixture.nativeElement)).not.toContain('系統管理 Admin');
  });

  it('shows the signed-in UserName in the header', () => {
    sessionStorage.clear();
    signIn(['Admin'], '王小明');
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('#signed-in-user')?.textContent).toContain('王小明');
  });

  it('logs out: clears session storage and returns to the login page', () => {
    sessionStorage.setItem('course-filters', '{}');
    const fixture = TestBed.createComponent(App);
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('#logout-button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(sessionStorage.length).toBe(0);
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: {} });
    expect((fixture.nativeElement as HTMLElement).querySelector('.sidebar')).toBeNull();
  });

  it('renders no shell when signed out', () => {
    sessionStorage.clear();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.sidebar')).toBeNull();
    expect(el.querySelector('router-outlet')).not.toBeNull();
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
    const links = Array.from(el.querySelectorAll('a.nav-item'));
    const link = links.find((a) => a.textContent?.includes('角色 AppRole')) as HTMLAnchorElement;
    expect(link).toBeDefined();
    expect(link.getAttribute('href')).toBe('/app-roles');
  });

  it('should show the AppUser entry first under 系統管理 Admin', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const link = (fixture.nativeElement as HTMLElement).querySelector('a.nav-item') as HTMLAnchorElement;

    expect(link.textContent).toContain('使用者 AppUser');
    expect(link.getAttribute('href')).toBe('/app-users');
  });

  it('should show the PublishStatus entry under 系統管理 Admin', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a.nav-item'));
    const link = links.find((a) => a.textContent?.includes('發布狀態 PublishStatus')) as HTMLAnchorElement;

    expect(link).toBeDefined();
    expect(link.getAttribute('href')).toBe('/publish-statuses');
  });

  it('should show the TokenUsage report entry under 系統管理 Admin', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a.nav-item'));
    const link = links.find((a) => a.textContent?.includes('用量報表 TokenUsage')) as HTMLAnchorElement;

    expect(link).toBeDefined();
    expect(link.getAttribute('href')).toBe('/token-usages');
  });

  it('should show the ModelPrice entry under 系統管理 Admin', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a.nav-item'));
    const link = links.find((a) => a.textContent?.includes('模型價格 ModelPrice')) as HTMLAnchorElement;

    expect(link).toBeDefined();
    expect(link.getAttribute('href')).toBe('/model-prices');
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

  it('should show the FeaturedPromoItem entry under 首頁 Home', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    const groups = Array.from(el.querySelectorAll('.nav-group')).map((g) => g.textContent?.trim());
    expect(groups).toContain('首頁 Home');
    const links = Array.from(el.querySelectorAll('a.nav-item'));
    const link = links.find((a) => a.textContent?.includes('上稿作業 FeaturedPromoItem')) as HTMLAnchorElement;
    expect(link).toBeDefined();
    expect(link.getAttribute('href')).toBe('/featured-promo-items');
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
