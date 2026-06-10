import React from "react";
import { Swiper, SwiperSlide } from "swiper/react";

import { Autoplay, Navigation } from "swiper/modules";
import { useTranslation } from "react-i18next";
import "swiper/css";
import "swiper/css/navigation";

const favouriteBanners = [
  {
    id: 1,
    image:
      "https://backend-1ten365.s3.ap-south-2.amazonaws.com/admins/686d88c9f758643dcddc3873/favoriteBanner/1000138159-1774522475368.png",
  },

  {
    id: 2,
    image:
      "https://backend-1ten365.s3.ap-south-2.amazonaws.com/admins/686d88c9f758643dcddc3873/favoriteBanner/1000138160-1774522468290.png",
  },

  {
    id: 3,
    image:
      "https://backend-1ten365.s3.ap-south-2.amazonaws.com/admins/686d88c9f758643dcddc3873/favoriteBanner/1000138105-1774503866012.png",
  },

  {
    id: 4,
    image:
      "https://backend-1ten365.s3.ap-south-2.amazonaws.com/admins/686d88c9f758643dcddc3873/favoriteBanner/1000138106-1774503859817.png",
  },

  {
    id: 5,
    image:
      "https://backend-1ten365.s3.ap-south-2.amazonaws.com/admins/686d88c9f758643dcddc3873/favoriteBanner/1000138107-1774503853168.png",
  },

  {
    id: 6,
    image:
      "https://backend-1ten365.s3.ap-south-2.amazonaws.com/admins/686d88c9f758643dcddc3873/favoriteBanner/1000138108-1774503842296.png",
  },
];

const FavouriteSlider = () => {
  const { t } = useTranslation();

  return (
    <div className="w-full bg-black py-3">
      {/* TITLE */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className="w-[5px] h-5 bg-yellow-400 rounded-full" />

        <h2
          className="
            text-white
            text-sm
            sm:text-base
            font-semibold
          "
        >
          {t("favourites")}
        </h2>
      </div>

      {/* SLIDER */}
      <Swiper
        modules={[Autoplay, Navigation]}
        spaceBetween={10}
        slidesPerView={1.2}
        loop={true}
        speed={700}
        autoplay={{
          delay: 3000,
          disableOnInteraction: false,
        }}
        breakpoints={{
          480: {
            slidesPerView: 1.5,
          },

          640: {
            slidesPerView: 2,
          },

          1024: {
            slidesPerView: 3,
          },
        }}
        className="favourite-swiper"
      >
        {favouriteBanners.map((banner) => (
          <SwiperSlide key={banner.id}>
            <div
              className="
    relative
    overflow-hidden
    rounded-lg

    bg-[#1a1a1a]

    cursor-pointer
    group

    flex
    items-center
    justify-center
  "
            >
              <img
                src={banner.image}
                alt="Favourite Banner"
                loading="lazy"
                decoding="async"
                className="
    w-full

    h-[140px]
    sm:h-[170px]
    lg:h-[190px]
    xl:h-[210px]

    object-contain

    bg-[#111111]

    transition-all
    duration-500

    group-hover:scale-[1.02]
  "
              />
            </div>
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
};

export default React.memo(FavouriteSlider);
