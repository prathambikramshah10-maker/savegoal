document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;
  confirmPendingPayment();
});

async function confirmPendingPayment() {
  const title = document.getElementById('payTitle');
  const status = document.getElementById('payStatus');
  const icon = document.getElementById('payIcon');
  const spinner = document.getElementById('paySpinner');

  const raw = sessionStorage.getItem('savegoal_payorder');
  if (!raw) {
    if (title) title.textContent = 'No payment to verify';
    if (status) status.textContent = "We couldn't find a pending payment. Returning to your dashboard.";
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 2000);
    return;
  }
  sessionStorage.removeItem('savegoal_payorder');

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    if (title) title.textContent = 'Something went wrong';
    if (status) status.textContent = 'Payment details were unreadable. Try depositing again.';
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 2500);
    return;
  }

  try {
    const res = await api.post(`/payments/${payload.orderId}/verify`);
    if (title) title.textContent = 'Payment confirmed!';
    if (icon) icon.textContent = '✅';
    if (status) status.textContent = res.message || 'Your savings were added to the goal.';
  } catch (err) {
    if (title) title.textContent = 'Payment not confirmed';
    if (icon) icon.textContent = '❌';
    if (status) status.textContent = err.message || 'The gateway could not confirm this payment. No balance was changed.';
  } finally {
    if (spinner) spinner.style.display = 'none';
    setTimeout(() => {
      window.location.href = payload.goalId ? `goal.html?id=${payload.goalId}` : 'dashboard.html';
    }, 2000);
  }
}