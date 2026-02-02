import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

type SetupState = { kind: 'working'; message: string };

@Component({
  selector: 'app-setup',
  templateUrl: './setup.component.html',
  styleUrls: ['./setup.component.css'],
})
export class SetupComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  state: SetupState = { kind: 'working', message: 'Redirecting…' };

  ngOnInit(): void {
    // Backward compatibility: old links used /setup?... — redirect them to /settings?...
    const qp = this.route.snapshot.queryParams;
    void this.router.navigate(['/settings'], { queryParams: qp, replaceUrl: true });
  }
}

