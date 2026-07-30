const state = {
  token: localStorage.getItem('token') || '',
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  mode: 'login',
  movies: [],
  showtimes: [],
  selectedMovie: null,
  selectedShowtime: null,
  selectedSeat: ''
};

const els = {
  sessionText: document.querySelector('#sessionText'),
  logoutButton: document.querySelector('#logoutButton'),
  loginTab: document.querySelector('#loginTab'),
  registerTab: document.querySelector('#registerTab'),
  authForm: document.querySelector('#authForm'),
  authSubmit: document.querySelector('#authSubmit'),
  nameInput: document.querySelector('#nameInput'),
  emailInput: document.querySelector('#emailInput'),
  passwordInput: document.querySelector('#passwordInput'),
  refreshButton: document.querySelector('#refreshButton'),
  movieList: document.querySelector('#movieList'),
  selectedMovieText: document.querySelector('#selectedMovieText'),
  showtimeList: document.querySelector('#showtimeList'),
  selectedShowtimeText: document.querySelector('#selectedShowtimeText'),
  seatGrid: document.querySelector('#seatGrid'),
  bookButton: document.querySelector('#bookButton'),
  bookingRefreshButton: document.querySelector('#bookingRefreshButton'),
  bookingList: document.querySelector('#bookingList'),
  toast: document.querySelector('#toast')
};

function setMode(mode) {
  state.mode = mode;
  els.loginTab.classList.toggle('active', mode === 'login');
  els.registerTab.classList.toggle('active', mode === 'register');
  els.nameInput.parentElement.classList.toggle('hidden', mode === 'login');
  els.authSubmit.textContent = mode === 'login' ? '로그인' : '회원가입';
}

function setSession(user, token) {
  state.user = user;
  state.token = token;
  if (user && token) {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('token', token);
  } else {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
  }
  renderSession();
}

function renderSession() {
  if (state.user) {
    els.sessionText.textContent = `${state.user.email} 계정으로 로그인 중입니다.`;
    els.logoutButton.classList.remove('hidden');
  } else {
    els.sessionText.textContent = '로그인 후 좌석을 선택해 예매하세요.';
    els.logoutButton.classList.add('hidden');
  }
}

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || '요청을 처리하지 못했습니다.');
  }
  return data;
}

function toast(message, type = 'info') {
  els.toast.textContent = message;
  els.toast.classList.toggle('error', type === 'error');
  els.toast.classList.remove('hidden');
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => els.toast.classList.add('hidden'), 2800);
}

function formatDate(value) {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function formatTime(value) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeStyle: 'short'
  }).format(new Date(value));
}

function formatShowtimeRange(showtime) {
  const startsAt = new Date(showtime.starts_at);
  const endsAt = new Date(startsAt.getTime() + showtime.duration_minutes * 60 * 1000);
  return `${formatDate(startsAt)} ~ ${formatTime(endsAt)}`;
}

async function loadMovies() {
  const data = await api('/movies');
  state.movies = data.movies;
  renderMovies();
}

function renderMovies() {
  els.movieList.innerHTML = '';
  if (state.movies.length === 0) {
    els.movieList.textContent = '등록된 영화가 없습니다.';
    return;
  }

  for (const movie of state.movies) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `choice ${state.selectedMovie?.id === movie.id ? 'active' : ''}`;
    button.innerHTML = `${movie.title}<span>${movie.duration_minutes}분</span>`;
    button.addEventListener('click', () => selectMovie(movie));
    els.movieList.append(button);
  }
}

async function selectMovie(movie) {
  state.selectedMovie = movie;
  state.selectedShowtime = null;
  state.selectedSeat = '';
  els.selectedMovieText.textContent = movie.title;
  els.selectedShowtimeText.textContent = '상영 시간을 선택하세요.';
  els.seatGrid.innerHTML = '';
  els.bookButton.disabled = true;
  renderMovies();

  const data = await api(`/movies/${movie.id}/showtimes`);
  state.showtimes = data.showtimes;
  renderShowtimes();
}

function renderShowtimes() {
  els.showtimeList.innerHTML = '';
  for (const showtime of state.showtimes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `choice ${state.selectedShowtime?.id === showtime.id ? 'active' : ''}`;
    button.innerHTML = `${formatShowtimeRange(showtime)}<span>${showtime.auditorium} · 좌석 ${showtime.seat_count}개</span>`;
    button.addEventListener('click', () => selectShowtime(showtime));
    els.showtimeList.append(button);
  }
}

async function selectShowtime(showtime) {
  state.selectedShowtime = showtime;
  state.selectedSeat = '';
  els.selectedShowtimeText.textContent = `${formatShowtimeRange(showtime)} · ${showtime.auditorium}`;
  renderShowtimes();
  await loadSeats();
}

async function loadSeats() {
  if (!state.selectedShowtime) return;
  const data = await api(`/movies/showtimes/${state.selectedShowtime.id}/seats`);
  renderSeats(data.seats);
}

function renderSeats(seats) {
  els.seatGrid.innerHTML = '';
  for (const seat of seats) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `seat ${seat.booked ? 'booked' : ''} ${state.selectedSeat === seat.code ? 'selected' : ''}`;
    button.textContent = seat.code;
    button.disabled = seat.booked;
    button.addEventListener('click', () => {
      state.selectedSeat = seat.code;
      renderSeats(seats);
      els.bookButton.disabled = !state.token;
    });
    els.seatGrid.append(button);
  }
  els.bookButton.disabled = !state.token || !state.selectedSeat;
}

async function loadBookings() {
  if (!state.token) {
    els.bookingList.textContent = '로그인이 필요합니다.';
    return;
  }
  const data = await api('/bookings/me');
  renderBookings(data.bookings);
}

function renderBookings(bookings) {
  els.bookingList.innerHTML = '';
  if (bookings.length === 0) {
    els.bookingList.textContent = '예매 내역이 없습니다.';
    return;
  }
  for (const booking of bookings) {
    const item = document.createElement('div');
    item.className = 'booking-item';
    const details = document.createElement('div');
    details.innerHTML = `${booking.movie_title}<span>${formatDate(booking.starts_at)} · ${booking.auditorium} · ${booking.seat_code}</span>`;

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'danger';
    cancelButton.textContent = '예매 취소';
    cancelButton.addEventListener('click', () => cancelBooking(booking.id));

    item.append(details, cancelButton);
    els.bookingList.append(item);
  }
}

async function cancelBooking(bookingId) {
  try {
    await api(`/bookings/${bookingId}`, { method: 'DELETE' });
    toast('예매를 취소했습니다.');
    await loadBookings();
    if (state.selectedShowtime) await loadSeats();
  } catch (error) {
    toast(error.message, 'error');
  }
}

els.loginTab.addEventListener('click', () => setMode('login'));
els.registerTab.addEventListener('click', () => setMode('register'));
els.logoutButton.addEventListener('click', () => {
  setSession(null, '');
  loadBookings();
  toast('로그아웃했습니다.');
});

els.authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const body = {
    email: els.emailInput.value,
    password: els.passwordInput.value
  };
  if (state.mode === 'register') body.name = els.nameInput.value;

  try {
    const data = await api(state.mode === 'login' ? '/auth/login' : '/auth/register', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    setSession(data.user, data.token);
    els.passwordInput.value = '';
    toast(state.mode === 'login' ? '로그인했습니다.' : '회원가입이 완료되었습니다.');
    await loadBookings();
    if (state.selectedShowtime) await loadSeats();
  } catch (error) {
    toast(error.message, 'error');
  }
});

els.refreshButton.addEventListener('click', () => loadMovies().catch((error) => toast(error.message, 'error')));
els.bookingRefreshButton.addEventListener('click', () => loadBookings().catch((error) => toast(error.message, 'error')));

els.bookButton.addEventListener('click', async () => {
  if (!state.selectedShowtime || !state.selectedSeat) return;
  try {
    await api('/bookings', {
      method: 'POST',
      body: JSON.stringify({
        showtimeId: state.selectedShowtime.id,
        seatCode: state.selectedSeat
      })
    });
    toast(`${state.selectedSeat} 좌석을 예매했습니다.`);
    state.selectedSeat = '';
    await loadSeats();
    await loadBookings();
  } catch (error) {
    toast(error.message, 'error');
    await loadSeats();
  }
});

setMode('login');
renderSession();
loadMovies().catch((error) => toast(error.message, 'error'));
loadBookings().catch(() => {});
