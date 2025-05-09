import React from 'react';
import Main from '../components/bookStore/Main';
import BottomNav from '../components/component/BottomNav';
import Header from '../components/bookStore/Header';
const BookStore = () => {
  return (
    <div>
      <Header />
      <Main />
      <BottomNav />
    </div>
  );
};

export default BookStore; 