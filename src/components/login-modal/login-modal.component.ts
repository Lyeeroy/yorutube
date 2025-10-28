import { Component, ChangeDetectionStrategy, output } from '@angular/core';

@Component({
  selector: 'app-login-modal',
  standalone: true,
  imports: [],
  templateUrl: './login-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginModalComponent {
  close = output<void>();
}
