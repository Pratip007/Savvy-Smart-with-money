import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './layout/header/header';
import { TabBarComponent } from './layout/tab-bar/tab-bar';
import { ToastComponent } from './shared/components/toast/toast';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, TabBarComponent, ToastComponent],
  template: `
    <app-header />
    <app-tab-bar />
    <main id="main-content">
      <router-outlet />
    </main>
    <app-toast />
  `,
  styleUrl: './app.scss'
})
export class App {}
