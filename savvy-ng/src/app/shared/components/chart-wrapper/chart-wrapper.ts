import { Component, input, OnChanges, AfterViewInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-chart-wrapper',
  standalone: true,
  template: `<canvas #canvas></canvas>`,
  styles: [`canvas { width: 100% !important; }`]
})
export class ChartWrapperComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  config = input<ChartConfiguration | null>(null);
  private chart: Chart | null = null;

  ngAfterViewInit(): void { this.createChart(); }

  ngOnChanges(): void {
    if (this.canvasRef) { this.destroyChart(); this.createChart(); }
  }

  ngOnDestroy(): void { this.destroyChart(); }

  private createChart(): void {
    const cfg = this.config();
    if (!cfg || !this.canvasRef) return;
    this.chart = new Chart(this.canvasRef.nativeElement, cfg);
  }

  private destroyChart(): void {
    if (this.chart) { this.chart.destroy(); this.chart = null; }
  }
}
