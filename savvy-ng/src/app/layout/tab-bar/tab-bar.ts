import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-tab-bar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav id="tab-bar">
      <a class="tab" routerLink="/transactions" routerLinkActive="active">
        <i class="fa-solid fa-receipt"></i>
        <span>Daily</span>
      </a>
      <a class="tab" routerLink="/estimates" routerLinkActive="active">
        <i class="fa-solid fa-file-invoice-dollar"></i>
        <span>Estimates</span>
      </a>
      <a class="tab" routerLink="/final" routerLinkActive="active">
        <i class="fa-solid fa-circle-check"></i>
        <span>Final</span>
      </a>
      <a class="tab" routerLink="/statistics" routerLinkActive="active">
        <i class="fa-solid fa-chart-pie"></i>
        <span>Statistics</span>
      </a>
      <a class="tab" routerLink="/settings" routerLinkActive="active">
        <i class="fa-solid fa-gear"></i>
        <span>Settings</span>
      </a>
    </nav>
  `,
  styles: [':host { display: contents; }']
})
export class TabBarComponent {}
